import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteGoLinks, siteMarketingPackages, sites } from "@/db/schema";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import { goDestinationSchema, type GoDestination } from "@/domain/site-go-links";
import { goLinkManagementSchema, goLinkStatusTransition, goLinkAvailability } from "@/domain/go-link-policy";
import { inspectGoDestination, listGoDestinationChoices } from "./go-destination-registry.server";
import { readSiteGoLinkEvidence } from "./go-link-evidence.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
const packageScope = z.object({ siteId: uuid, packageId: uuid }).strict();
const createSchema = packageScope.extend({
  destination:goDestinationSchema,management:goLinkManagementSchema.optional(),
}).strict();
const choicesSchema=packageScope.extend({
  kind:z.enum(["site-page","adult-training","class","enrichment","information"]),
}).strict();
const manageSchema=packageScope.extend({
  linkId:uuid, action:z.enum(["pause","resume"]),
}).strict();
const revokeSchema = packageScope.extend({ linkId: uuid }).strict();

async function authorizedPackage(
  siteId: string, packageId: string, write: boolean,
  reader: Pick<typeof db, "select"> = db,
) {
  const actor = await getCommandContext(getRequest());
  const [site] = await reader.select({
    id: sites.id, organizationId: sites.organizationId,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  assertSiteSetupScope(actor, site, write ? "program.launch.start" : "program.read");
  const [pkg] = await reader.select({
    id: siteMarketingPackages.id, status: siteMarketingPackages.status,
  }).from(siteMarketingPackages).where(and(
    eq(siteMarketingPackages.id, packageId), eq(siteMarketingPackages.siteId, siteId),
  )).limit(1);
  if (!pkg) throw new DomainError("UNAVAILABLE", "Outreach plan unavailable for this Site.");
  return { actor, site: site!, pkg };
}

/** Create only immutable, scoped, public navigation. Editing an existing link is forbidden. */
export const createSiteGoLink = createServerFn({ method: "POST" })
  .validator((value: unknown) => createSchema.parse(value))
  .handler(async ({ data }) => db.transaction(async tx => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, site, pkg } = await authorizedPackage(data.siteId, data.packageId, true, tx);
    if (pkg.status !== "draft")
      throw new DomainError("CONFLICT", "Restore the outreach plan before creating a link.");

    const inspection=await inspectGoDestination(
      site.id,data.destination,"000000000000",tx);
    if(!inspection.available)
      throw new DomainError("UNAVAILABLE",
        "This destination is not currently published or eligible for public sharing.");
    const name=data.management?.name ?? inspection.title.slice(0,120);
    const channel=data.management?.channel ?? null;
    const startsAt=data.management?.startsAt?new Date(data.management.startsAt):null;
    const expiresAt=data.management?.expiresAt?new Date(data.management.expiresAt):null;
    if(expiresAt && expiresAt<=new Date())
      throw new DomainError("VALIDATION_FAILED","Expiration must be in the future.");
    // Schedule and destination are immutable. Reissue or pause instead of
    // changing the meaning of a code already printed in a physical flyer.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(9).toString("base64url");
      const [created] = await tx.insert(siteGoLinks).values({
        code, siteId: site.id, organizationId: site.organizationId,
        packageId: pkg.id, createdByPersonId: actor.actorPersonId!,
        destination:data.destination,name,channel,startsAt,expiresAt,
      }).onConflictDoNothing({ target: siteGoLinks.code }).returning();
      if (!created) continue;
      await writeAudit(tx, actor, {
        action: "site.go_link.create", entityType: "site_go_link", entityId: created.id,
        scope: { siteId: site.id, organizationId: site.organizationId },
        after: { packageId: pkg.id, destination: data.destination.kind,
          status: created.status, name,channel,startsAt,expiresAt },
      });
      return {
        id: created.id, code: created.code, destination: created.destination,
        status:created.status,name:created.name,channel:created.channel,
        startsAt:created.startsAt?.toISOString()??null,
        expiresAt:created.expiresAt?.toISOString()??null,
        createdAt:created.createdAt.toISOString(),
      };
    }
    throw new DomainError("CONFLICT", "Unable to create a unique link. Try again.");
  }));

export const listSiteGoLinks = createServerFn({ method: "GET" })
  .validator((value: unknown) => packageScope.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    await authorizedPackage(data.siteId, data.packageId, false);
    const links = await db.select({
      id: siteGoLinks.id, code: siteGoLinks.code,
      destination: siteGoLinks.destination, status: siteGoLinks.status,
      name:siteGoLinks.name,channel:siteGoLinks.channel,
      startsAt:siteGoLinks.startsAt,expiresAt:siteGoLinks.expiresAt,
      createdAt: siteGoLinks.createdAt,
    }).from(siteGoLinks).where(and(
      eq(siteGoLinks.siteId, data.siteId), eq(siteGoLinks.packageId, data.packageId),
    )).orderBy(desc(siteGoLinks.createdAt));
    const evidence=await readSiteGoLinkEvidence(data.siteId,data.packageId);
    const byId=new Map(evidence.map(item=>[item.linkId,item]));
    return links.map(link => ({
      ...link,createdAt:link.createdAt.toISOString(),
      startsAt:link.startsAt?.toISOString()??null,
      expiresAt:link.expiresAt?.toISOString()??null,
      availability:goLinkAvailability(link),
      evidence:byId.get(link.id)??null,
    }));
  });

export const revokeSiteGoLink = createServerFn({ method: "POST" })
  .validator((value: unknown) => revokeSchema.parse(value))
  .handler(async ({ data }) => db.transaction(async tx => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, site } = await authorizedPackage(data.siteId, data.packageId, true, tx);
    const [link] = await tx.select().from(siteGoLinks).where(and(
      eq(siteGoLinks.id, data.linkId), eq(siteGoLinks.siteId, site.id),
      eq(siteGoLinks.packageId, data.packageId),
    )).for("update").limit(1);
    if (!link) throw new DomainError("UNAVAILABLE", "Go link not found in this outreach plan.");
    if (link.status === "revoked") return { id: link.id, status: "revoked" as const };
    await tx.update(siteGoLinks).set({
      status: "revoked", updatedAt: new Date(),
    }).where(eq(siteGoLinks.id, link.id));
    await writeAudit(tx, actor, {
      action: "site.go_link.revoke", entityType: "site_go_link", entityId: link.id,
      scope: { siteId: site.id, organizationId: site.organizationId },
      before: { status: link.status }, after: { status: "revoked" },
    });
    return { id: link.id, status: "revoked" as const };
  }));

/** All discovery is governed by the same Site+package permission as management. */
export const listAvailableGoDestinations = createServerFn({method:"GET"})
  .validator((value:unknown)=>choicesSchema.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    await authorizedPackage(data.siteId,data.packageId,false);
    return listGoDestinationChoices(data.siteId,data.kind);
  });

/** Privately test a saved link without a public redirect or analytics count. */
export const inspectSavedGoLink = createServerFn({method:"GET"})
  .validator((value:unknown)=>revokeSchema.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    await authorizedPackage(data.siteId,data.packageId,false);
    const [link]=await db.select().from(siteGoLinks).where(and(
      eq(siteGoLinks.id,data.linkId),eq(siteGoLinks.siteId,data.siteId),
      eq(siteGoLinks.packageId,data.packageId),
    )).limit(1);
    if(!link)throw new DomainError("UNAVAILABLE","Go link not found.");
    const availability=goLinkAvailability(link);
    const destination=availability==="available"
      ?await inspectGoDestination(link.siteId,link.destination,link.code):null;
    return {
      availability,destinationAvailable:destination?.available??false,
      title:destination?.title??link.name,
      navigable:availability==="available" && destination?.available===true,
    };
  });

/** Pause/resume without changing an already distributed destination.
 * Revoked links can never be resumed. */
export const setSiteGoLinkPaused = createServerFn({method:"POST"})
  .validator((value:unknown)=>manageSchema.parse(value))
  .handler(async({data})=>db.transaction(async tx=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {actor,site}=await authorizedPackage(data.siteId,data.packageId,true,tx);
    const [link]=await tx.select().from(siteGoLinks).where(and(
      eq(siteGoLinks.id,data.linkId),eq(siteGoLinks.siteId,site.id),
      eq(siteGoLinks.packageId,data.packageId),
    )).for("update").limit(1);
    if(!link)throw new DomainError("UNAVAILABLE","Go link unavailable.");
    const desired=data.action==="pause"?"paused" as const:"active" as const;
    if(link.status==="revoked")
      throw new DomainError("CONFLICT","A revoked link cannot be resumed.");
    const status=goLinkStatusTransition(link.status,desired);
    if(status!==link.status){
      await tx.update(siteGoLinks).set({status,updatedAt:new Date()})
        .where(eq(siteGoLinks.id,link.id));
      await writeAudit(tx,actor,{
        action:"site.go_link.status_change",entityType:"site_go_link",entityId:link.id,
        scope:{siteId:site.id,organizationId:site.organizationId},
        before:{status:link.status},after:{status},
      });
    }
    return {id:link.id,status};
  }));
