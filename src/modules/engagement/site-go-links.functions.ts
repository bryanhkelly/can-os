import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { programs, siteGoLinks, siteMarketingPackages, sites } from "@/db/schema";
import { assertSiteSetupScope, assertWholeSiteProgramsInScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import { goDestinationKindSchema, goDestinationSchema } from "@/domain/site-go-links";
import { goLikeContainsLiteral } from "@/domain/go-link-search";
import { goLinkManagementSchema, goLinkStatusTransition, goLinkAvailability } from "@/domain/go-link-policy";
import { inspectGoDestination, listGoDestinationChoices } from "./go-destination-registry.server";
import { readSiteGoLinkEvidence } from "./go-link-evidence.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
/** Site ownership is mandatory; a marketing-package relationship is optional. */
const packageScope = z.object({ siteId: uuid, packageId: uuid.optional() }).strict();
const createSchema = packageScope.extend({
  requestId:uuid.optional(),destination:goDestinationSchema,
  management:goLinkManagementSchema.optional(),
}).strict();
const pageSchema=packageScope.extend({
  cursor:uuid.optional(),limit:z.number().int().min(1).max(50).default(20),
  term:z.string().trim().max(80).optional(),
}).strict();
const choicesSchema=packageScope.extend({
  kind:goDestinationKindSchema,
  term:z.string().trim().max(80).optional(),
}).strict();
const manageSchema=packageScope.extend({
  linkId:uuid, action:z.enum(["pause","resume"]),
}).strict();
const revokeSchema = packageScope.extend({ linkId: uuid }).strict();

async function authorizedPackage(
  siteId: string, packageId: string | undefined, write: boolean,
  reader: Pick<typeof db, "select"> = db,
) {
  const actor = await getCommandContext(getRequest());
  const [site] = await reader.select({
    id: sites.id, organizationId: sites.organizationId,
    lifecycleStatus:sites.lifecycleStatus,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  assertSiteSetupScope(actor, site, write ? "program.launch.start" : "program.read");
  // An unscoped Site inventory includes all its campaigns and offerings.
  // A partial Program grant must not allow browsing sibling Program links.
  if(!packageId){
    const attached=await reader.select({id:programs.id}).from(programs)
      .where(and(eq(programs.siteId,siteId),
        eq(programs.organizationId,site!.organizationId)));
    assertWholeSiteProgramsInScope(actor,attached.map(item=>item.id),"Site link management");
  }
  const [pkg]=packageId?await reader.select({
    id:siteMarketingPackages.id,status:siteMarketingPackages.status,
    organizationId:siteMarketingPackages.organizationId,
  }).from(siteMarketingPackages).where(and(
    eq(siteMarketingPackages.id,packageId),
    eq(siteMarketingPackages.siteId,siteId),
    eq(siteMarketingPackages.organizationId,site!.organizationId),
  )).limit(1):[];
  if(packageId && !pkg)
    throw new DomainError("UNAVAILABLE","Outreach plan unavailable for this Site.");
  return {actor,site:site!,pkg:pkg??null};
}

function toGoLinkView(link:typeof siteGoLinks.$inferSelect) {
  return {
    id:link.id,code:link.code,destination:goDestinationSchema.parse(link.destination),
    status:link.status,name:link.name,channel:link.channel,
    startsAt:link.startsAt?.toISOString()??null,
    expiresAt:link.expiresAt?.toISOString()??null,
    createdAt:link.createdAt.toISOString(),
  };
}

/** Create immutable Site-owned navigation, optionally linked to Introduce. */
export const createSiteGoLink = createServerFn({ method: "POST" })
  .validator((value: unknown) => createSchema.parse(value))
  .handler(async ({ data }) => db.transaction(async tx => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, site, pkg } = await authorizedPackage(data.siteId, data.packageId, true, tx);
    if(data.destination.kind==="website-preview")throw new DomainError("FORBIDDEN","Create website previews from Website & Brand.");
    const requestId=data.requestId??randomUUID();
    // Fingerprint the requested semantics, not a mutable Site or destination
    // title. Retrying after publication closes returns the same original code.
    const fingerprint=createHash("sha256").update(JSON.stringify({
      siteId:site.id,packageId:pkg?.id??null,destination:data.destination,
      management:data.management??null,
    })).digest("hex");
    const lockKey=[site.id,actor.actorPersonId,requestId].join(":");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [prior]=await tx.select().from(siteGoLinks).where(and(
      eq(siteGoLinks.siteId,site.id),
      eq(siteGoLinks.createdByPersonId,actor.actorPersonId!),
      eq(siteGoLinks.requestId,requestId),
    )).limit(1);
    if(prior){
      if(prior.requestFingerprint!==fingerprint)
        throw new DomainError("CONFLICT","This request ID was already used for a different link.");
      return toGoLinkView(prior);
    }
    if (pkg && pkg.status !== "draft")
      throw new DomainError("CONFLICT","Restore the outreach plan before creating a link.");
    if(site.lifecycleStatus==="closed")
      throw new DomainError("UNAVAILABLE","Closed Sites cannot create public Go Links.");
    const inspection=await inspectGoDestination(
      site.id,data.destination,"000000000000",tx);
    if(!inspection.available)
      throw new DomainError("UNAVAILABLE",
        "This destination is not currently published or eligible for public sharing.");
    const name=data.management?.name??inspection.title.slice(0,120);
    const channel=data.management?.channel??null;
    const startsAt=data.management?.startsAt?new Date(data.management.startsAt):null;
    const expiresAt=data.management?.expiresAt?new Date(data.management.expiresAt):null;
    if(expiresAt&&expiresAt<=new Date())
      throw new DomainError("VALIDATION_FAILED","Expiration must be in the future.");
    // Schedule and destination are immutable. Reissue or pause instead of
    // changing the meaning of a code already printed in a physical flyer.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(9).toString("base64url");
      const [created] = await tx.insert(siteGoLinks).values({
        code, siteId: site.id, organizationId: site.organizationId,
        packageId: pkg?.id??null,createdByPersonId:actor.actorPersonId!,
        destination:data.destination,name,channel,startsAt,expiresAt,
        requestId,requestFingerprint:fingerprint,
      }).onConflictDoNothing({ target: siteGoLinks.code }).returning();
      if (!created) continue;
      await writeAudit(tx, actor, {
        action: "site.go_link.create", entityType: "site_go_link", entityId: created.id,
        scope: { siteId: site.id, organizationId: site.organizationId },
        after: { packageId: pkg?.id??null, destination: data.destination.kind,
          status: created.status, name,channel,startsAt,expiresAt },
      });
      return toGoLinkView(created);
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
      eq(siteGoLinks.siteId, data.siteId),isNull(siteGoLinks.engagementVersionId),
      data.packageId?eq(siteGoLinks.packageId,data.packageId):undefined,
    )).orderBy(desc(siteGoLinks.createdAt)).limit(500);
    // Reporting reads must never take down authorized link management.
    // A missing observation is unavailable evidence, not zero activity.
    let evidence:Awaited<ReturnType<typeof readSiteGoLinkEvidence>>=[];
    try{
      evidence=await readSiteGoLinkEvidence(data.siteId,data.packageId);
    }catch{
      console.error("Go Link evidence read unavailable",{kind:"operational_analytics"});
    }
    const byId=new Map(evidence.map(item=>[item.linkId,item]));
    return links.map(link => ({
      ...link,destination:goDestinationSchema.parse(link.destination),
      createdAt:link.createdAt.toISOString(),
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
      isNull(siteGoLinks.engagementVersionId),
      data.packageId?eq(siteGoLinks.packageId,data.packageId):undefined,
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
    const {site}=await authorizedPackage(data.siteId,data.packageId,false);
    if(site.lifecycleStatus==="closed")return [];
    return listGoDestinationChoices(data.siteId,data.kind,db,data.term);
  });

/** Privately test a saved link without a public redirect or analytics count. */
export const inspectSavedGoLink = createServerFn({method:"GET"})
  .validator((value:unknown)=>revokeSchema.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {site}=await authorizedPackage(data.siteId,data.packageId,false);
    const [link]=await db.select().from(siteGoLinks).where(and(
      eq(siteGoLinks.id,data.linkId),eq(siteGoLinks.siteId,data.siteId),
      isNull(siteGoLinks.engagementVersionId),
      data.packageId?eq(siteGoLinks.packageId,data.packageId):undefined,
    )).limit(1);
    if(!link)throw new DomainError("UNAVAILABLE","Go link not found.");
    const availability=goLinkAvailability(link);
    const destination=availability==="available" && site.lifecycleStatus!=="closed"
      ?await inspectGoDestination(link.siteId,link.destination,link.code):null;
    return {
      availability,destinationAvailable:destination?.available??false,
      title:destination?.title??link.name,
      navigable:availability==="available" &&
        site.lifecycleStatus!=="closed" && destination?.available===true,
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
      isNull(siteGoLinks.engagementVersionId),
      data.packageId?eq(siteGoLinks.packageId,data.packageId):undefined,
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

/** Stable keyset pagination by (created_at, id). The cursor is a scoped
 * existing link ID, not a grant or a timestamp rounded to milliseconds.
 * This avoids missing/repeating ties when new links are issued concurrently.
 */
export const listSiteGoLinksPage=createServerFn({method:"GET"})
  .validator((value:unknown)=>pageSchema.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    await authorizedPackage(data.siteId,data.packageId,false);
    const scope=and(eq(siteGoLinks.siteId,data.siteId),
      isNull(siteGoLinks.engagementVersionId),
      data.packageId?eq(siteGoLinks.packageId,data.packageId):undefined);
    const [cursor]=data.cursor?await db.select({
      createdAt:siteGoLinks.createdAt,id:siteGoLinks.id,
    }).from(siteGoLinks).where(and(scope,eq(siteGoLinks.id,data.cursor))).limit(1):[];
    if(data.cursor && !cursor)
      throw new DomainError("UNAVAILABLE","Go Link page cursor is invalid for this Site.");
    // Compare against the exact Postgres timestamp, not a JavaScript Date:
    // Date rounds timestamptz microseconds to milliseconds and could skip
    // records created in the same millisecond as the cursor.
    const older=cursor?sql`(${siteGoLinks.createdAt},${siteGoLinks.id}) <
      (SELECT created_at,id FROM public.site_go_links WHERE id=${cursor.id}
        AND site_id=${data.siteId}
        ${data.packageId?sql`AND package_id=${data.packageId}`:sql``})`:undefined;
    const rows=await db.select({
      id:siteGoLinks.id,code:siteGoLinks.code,destination:siteGoLinks.destination,
      status:siteGoLinks.status,name:siteGoLinks.name,channel:siteGoLinks.channel,
      startsAt:siteGoLinks.startsAt,expiresAt:siteGoLinks.expiresAt,
      packageId:siteGoLinks.packageId,createdAt:siteGoLinks.createdAt,
    }).from(siteGoLinks).where(and(scope,older,
      data.term?ilike(siteGoLinks.name,goLikeContainsLiteral(data.term)):undefined))
      .orderBy(desc(siteGoLinks.createdAt),desc(siteGoLinks.id))
      .limit(data.limit+1);
    const hasMore=rows.length>data.limit,items=rows.slice(0,data.limit);
    let evidence:Awaited<ReturnType<typeof readSiteGoLinkEvidence>>|null=null;
    try {
      evidence=await readSiteGoLinkEvidence(
        data.siteId,data.packageId,db,items.map(item=>item.id),
      );
    }catch{
      console.error("Go Link page evidence unavailable",{kind:"operational_analytics"});
    }
    const evidenceById=new Map((evidence??[]).map(value=>[value.linkId,value]));
    return {
      items:items.map(item=>({
        ...item,destination:goDestinationSchema.parse(item.destination),
        createdAt:item.createdAt.toISOString(),
        startsAt:item.startsAt?.toISOString()??null,
        expiresAt:item.expiresAt?.toISOString()??null,
        availability:goLinkAvailability(item),
        evidence:evidence?evidenceById.get(item.id)??null:null,
      })),
      nextCursor:hasMore?items.at(-1)?.id??null:null,
    };
  });
