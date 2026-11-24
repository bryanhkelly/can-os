import { readSavedBrandVersion } from "./site-brand.server";
import { siteBrandPresentationIdentity } from "@/domain/site-brand";
import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteLocalContentVersions, sites, siteGoLinks } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import {
  classifySiteLocalContent, normalizeSiteLocalContent,
} from "@/domain/site-local-content";
import { findGoIssuance, goRequestFingerprint, issueAuthorizedGoLink, transitionAuthorizedGoLink } from "@/modules/engagement/go-link-lifecycle.server";
import { buildUrlDestination } from "@/domain/url-destinations";
import { getPartnerWebsitePreview } from "./site-website-preview.server";
import { sitePreviewSnapshotKey, writeSitePreviewSnapshot, deleteUnreferencedSitePreviewSnapshot } from "@/platform/storage/site-preview-snapshots.server";

import { getCommandContext } from "@/modules/identity/command-context.server";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const siteIdSchema = z.string().uuid();
const shareIdentifier = z.string().uuid();
const previewParams = z.object({ siteId: siteIdSchema }).strict();

/** A verified Site registrar or explicitly appointed website publisher may
 * share the Site they control. Organization scope is never inferred from a URL.
 */
async function assertPreviewSharingScope(
  actor: AccessContext, site: { id: string; organizationId: string } | null | undefined,
  executor: Pick<typeof db, "select"> = db,
) {
  const editor = await requirePartnerWebsiteEditor(actor, executor, "site.website.draft.write");
  if (!site || editor.id !== site.id || editor.organizationId !== site.organizationId)
    throw new AuthorizationError("website sharing Site scope");
}

async function authorizedShareSite(siteId: string) {
  const actor = await getCommandContext(getRequest());
  const [site] = await db.select({
    id: sites.id, organizationId: sites.organizationId, name: sites.name,
    lifecycleStatus: sites.lifecycleStatus,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new AuthorizationError("Site preview sharing scope");
  await assertPreviewSharingScope(actor, site);
  // Closed Sites cannot issue new links, but their authorized operators may
  // still inspect and revoke existing links. Public GET already denies closed Sites.
  return { actor, site };
}

async function previewLinks(siteId:string, reader:Pick<typeof db,"select">=db) {
  return reader.select().from(siteGoLinks).where(and(eq(siteGoLinks.siteId,siteId),sql`${siteGoLinks.destination}->>'kind'='website-preview'`)).orderBy(desc(siteGoLinks.createdAt));
}
/** Authorized operators can retrieve the canonical Go codes. */
export const listSitePreviewShares = createServerFn({ method: "GET" })
  .validator((value: unknown) => previewParams.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { site } = await authorizedShareSite(data.siteId);
    const links=await previewLinks(site.id);
    return links.flatMap(link=>link.destination?.kind==="website-preview"?[{
      id:link.id,code:link.code,createdAt:link.createdAt.toISOString(),expiresAt:link.expiresAt?.toISOString()??null,
      revokedAt:link.status==="revoked"?link.updatedAt.toISOString():null,paused:link.status==="paused",
      sourceRevision:link.destination.sourceRevision,brandVersionId:link.destination.brandVersionId,
    }]:[]);
  });

/** An immutable, sanitized website snapshot is captured when the URL is
 * created. Editing the Site later never silently changes what recipients see.
 * The Go code is retrievable by authorized Site operators; the HTML stays private.
 */
export const createSitePreviewShare = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: siteIdSchema,
    requestId: z.string().uuid(),
    expiresAfterDays: z.union([z.literal(7), z.literal(30), z.null()]),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, site: authorizedSite } = await authorizedShareSite(data.siteId);
    const fingerprint=goRequestFingerprint({kind:"website-preview",siteId:data.siteId,expiresAfterDays:data.expiresAfterDays});
    const prior=await db.transaction(tx=>findGoIssuance(tx,actor,authorizedSite,data.requestId,fingerprint));
    if(prior?.destination?.kind==="website-preview")return {shareId:prior.id,relativeUrl:buildUrlDestination({kind:"go",code:prior.code}).href,expiresAt:prior.expiresAt?.toISOString()??null,sourceRevision:prior.destination.sourceRevision};
    // Render outside the write transaction: the renderer uses its own canonical
    // read queries and must not hold a Site row lock during rendering.
    let stage = "render";
    let attemptedSnapshotId:string|undefined;
    try {
      const preview=await getPartnerWebsitePreview(actor,undefined,"external-preview");
      stage = "transaction";
      return await db.transaction(async tx => {
      const [site] = await tx.select({
        id: sites.id, name: sites.name, organizationId: sites.organizationId,
        lifecycleStatus: sites.lifecycleStatus, metadata: sites.metadata,
        updatedAt: sites.updatedAt,
      }).from(sites).where(eq(sites.id, data.siteId)).for("update").limit(1);
      if (!site) throw new AuthorizationError("Site preview sharing scope");
      await assertPreviewSharingScope(actor, site, tx);
      const retry=await findGoIssuance(tx,actor,site,data.requestId,fingerprint);
      if(retry?.destination?.kind==="website-preview")return {shareId:retry.id,relativeUrl:buildUrlDestination({kind:"go",code:retry.code}).href,expiresAt:retry.expiresAt?.toISOString()??null,sourceRevision:retry.destination.sourceRevision};
      if (site.lifecycleStatus === "closed") throw new AuthorizationError("closed Site");
      const now = new Date();
      const links=await previewLinks(site.id,tx);
      if (links.filter(link=>link.status!=="revoked" && (!link.expiresAt || link.expiresAt>now)).length >= 5)
        throw new DomainError("UNAVAILABLE", "Revoke an unused preview link before creating another.");

      const [latest] = await tx.select({
        revision: siteLocalContentVersions.revision,
        content: siteLocalContentVersions.content,
        status: siteLocalContentVersions.status,
      }).from(siteLocalContentVersions).where(eq(siteLocalContentVersions.siteId, site.id))
        .orderBy(desc(siteLocalContentVersions.revision)).limit(1);
      if (!latest)
        throw new DomainError("UNAVAILABLE",
          "Save your website design in Establish before creating a shareable preview.");
      const content = normalizeSiteLocalContent(latest.content, { allowIncompleteImage: true });
      const brand=await readSavedBrandVersion(site.id,undefined,tx);
      if(!brand)throw new DomainError("UNAVAILABLE",
        "Save your Site Brand before sharing your website preview.");
      // A Site may share its full proposed website before image approvals.
      // The canonical projection omits incomplete or withdrawn artwork.
      const websiteContent={...content,branding:siteBrandPresentationIdentity(
        brand.resolved,content.branding.templateId)};
      if (latest?.status === "review_required" || classifySiteLocalContent(websiteContent).status !== "published")
        throw new DomainError("UNAVAILABLE",
          "This website revision contains protected claims needing review. Update your website copy before sharing.");

      // Render the SAME saved Site revision and CAN OS sections as the
      // authenticated Website & Brand preview. Never synthesize a miniature
      // second website or silently suppress its setup/network sections.
      stage = "revision-check";
      if(preview.siteId!==site.id ||
        preview.siteConfigurationRevision!==site.updatedAt.toISOString() ||
        preview.currentRevision!==latest.revision ||
        preview.currentBrandVersionId!==brand.version.id ||
        !preview.previewPages["/"])
        throw new DomainError("UNAVAILABLE",
          "The website changed while preparing this share. Reload the saved revision and try again.");
      const shareId=randomUUID();
      attemptedSnapshotId=shareId;
      stage = "snapshot-storage";
      const snapshot=await writeSitePreviewSnapshot(
        sitePreviewSnapshotKey(site.id,shareId),preview.previewPages);

      const expiresAt=data.expiresAfterDays===null?null:new Date(now.getTime()+data.expiresAfterDays*86_400_000);
      stage = "share-persistence";
      const entry=await issueAuthorizedGoLink(tx,actor,site,{
        name:"Website preview · Revision "+latest.revision,expiresAt,
        requestId:data.requestId,requestFingerprint:fingerprint,
        destination:{kind:"website-preview",snapshotId:shareId,snapshotDigest:snapshot.digest,
          sourceRevision:latest.revision,brandVersionId:brand.version.id},
      });
      stage = "audit";
      await writeAudit(tx, actor, {
        action: "site.website.preview_share.created",
        entityType: "site", entityId: site.id,
        scope: { organizationId: site.organizationId, siteId: site.id },
        after: { shareId: entry.id, sourceRevision: latest.revision,
          brandVersionId:brand.version.id,
          expiresAt: expiresAt?.toISOString()??null, proposed: true, officialPublication: false },
      });
      stage = "event";
      await emitEvent(tx, {
        eventType: EventTypes.SiteWebsitePreviewShared,
        aggregateType: "site", aggregateId: site.id,
        actorPersonId: actor.actorPersonId, siteId: site.id,
        organizationId: site.organizationId,
        payload: { shareId: entry.id, sourceRevision: latest.revision,
          expiresAt: expiresAt?.toISOString()??null },
      });
      return {
        shareId: entry.id,
        relativeUrl: buildUrlDestination({kind:"go",code:entry.code}).href,
        expiresAt: expiresAt?.toISOString()??null, sourceRevision: latest.revision,
      };
      });
    } catch (error) {
      // A lost commit response is not proof of rollback. Confirm absence in
      // a new transaction under the same request lock before deleting.
      if(attemptedSnapshotId){
        const snapshotId=attemptedSnapshotId;
        try{
          await db.transaction(async tx=>{
            await findGoIssuance(tx,actor,authorizedSite,data.requestId,fingerprint);
            const [reference]=await tx.select({id:siteGoLinks.id}).from(siteGoLinks).where(and(
              eq(siteGoLinks.siteId,data.siteId),sql`${siteGoLinks.destination}->>'snapshotId'=${snapshotId}`,
            )).limit(1);
            if(!reference)await deleteUnreferencedSitePreviewSnapshot(data.siteId,snapshotId);
          });
        }catch{console.error("Website preview artifact reconciliation deferred");}
      }
      // Do not log content, bearer credentials, SQL or raw provider errors.
      console.error("Website preview share creation failed", { stage, errorType: error instanceof Error ? error.name : "unknown" });
      throw error;
    }
  });

/** Every lifecycle transition uses exact Website & Brand authority and the
 * canonical Go state machine. A revoked preview cannot be resumed. */
const previewShareStateParams=z.object({siteId:siteIdSchema,shareId:shareIdentifier}).strict();
async function changePreviewState(data:z.infer<typeof previewShareStateParams>,desired:"active"|"paused"|"revoked"){
  setResponseHeader("Cache-Control","private, no-store");
  const {actor}=await authorizedShareSite(data.siteId);
  return db.transaction(async tx=>{
    const [site]=await tx.select().from(sites).where(eq(sites.id,data.siteId)).for("update").limit(1);
    if(!site)throw new AuthorizationError("Site preview sharing scope");
    await assertPreviewSharingScope(actor,site,tx);
    const [link]=await tx.select().from(siteGoLinks).where(and(
      eq(siteGoLinks.id,data.shareId),eq(siteGoLinks.siteId,site.id),
      eq(siteGoLinks.organizationId,site.organizationId),
    )).for("update").limit(1);
    if(link?.destination?.kind!=="website-preview")
      throw new DomainError("UNAVAILABLE","This preview link no longer exists.");
    if(desired==="active"&&(site.lifecycleStatus==="closed"||(link.expiresAt&&link.expiresAt<=new Date())))
      throw new DomainError("UNAVAILABLE","This preview is no longer eligible to resume.");
    const result=await transitionAuthorizedGoLink(tx,actor,site,link,desired);
    const changed=result.status!==link.status;
    if(changed&&desired==="revoked")
      await emitEvent(tx,{eventType:EventTypes.SiteWebsitePreviewRevoked,aggregateType:"site",aggregateId:site.id,
        actorPersonId:actor.actorPersonId,siteId:site.id,organizationId:site.organizationId,
        payload:{shareId:link.id,revokedAt:new Date().toISOString()}});
    return {changed,status:result.status};
  });
}
export const revokeSitePreviewShare=createServerFn({method:"POST"})
  .validator((value:unknown)=>previewShareStateParams.parse(value))
  .handler(({data})=>changePreviewState(data,"revoked"));
export const setSitePreviewSharePaused=createServerFn({method:"POST"})
  .validator((value:unknown)=>previewShareStateParams.extend({action:z.enum(["pause","resume"])}).parse(value))
  .handler(({data})=>changePreviewState(data,data.action==="pause"?"paused":"active"));
