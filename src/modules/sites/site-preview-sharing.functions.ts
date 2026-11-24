import { readSavedBrandVersion } from "./site-brand.server";
import { siteBrandPresentationIdentity } from "@/domain/site-brand";
import { randomBytes, randomUUID } from "node:crypto";
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
import {
  readSitePreviewShares, type SitePreviewShare,
} from "@/domain/site-preview-sharing";
import { goLinkAvailability } from "@/domain/go-link-policy";
import { buildUrlDestination } from "@/domain/url-destinations";
import { nextSiteConfigurationRevision } from "@/domain/site-setup-configuration";
import { getPartnerWebsitePreview } from "./site-website-preview.server";
import { sitePreviewSnapshotKey, writeSitePreviewSnapshot } from "@/platform/storage/site-preview-snapshots.server";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
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
  if (actor.role === "site_website_editor") {
    const editor = await requirePartnerWebsiteEditor(actor, executor, "site.website.draft.write");
    if (editor.id !== site?.id) throw new AuthorizationError("website sharing Site scope");
    return;
  }
  assertSiteSetupScope(actor, site, "program.launch.start");
}

async function authorizedShareSite(siteId: string) {
  const actor = await getCommandContext(getRequest());
  const [site] = await db.select({
    id: sites.id, organizationId: sites.organizationId, name: sites.name,
    lifecycleStatus: sites.lifecycleStatus, metadata: sites.metadata,
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
function overview(shares: readonly SitePreviewShare[]) {
  return shares.map(share => ({
    id: share.id, createdAt: share.createdAt, expiresAt: share.expiresAt,
    revokedAt: share.revokedAt, sourceRevision: share.sourceRevision,
    brandVersionId:share.brandVersionId??null, code:null as string|null, paused:false,
  }));
}

/** Authenticated operators see metadata only, never any previously-issued token. */
export const listSitePreviewShares = createServerFn({ method: "GET" })
  .validator((value: unknown) => previewParams.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { site } = await authorizedShareSite(data.siteId);
    const links=await previewLinks(site.id);
    return [...links.flatMap(link=>link.destination?.kind==="website-preview"?[{
      id:link.id,code:link.code,createdAt:link.createdAt.toISOString(),expiresAt:link.expiresAt?.toISOString()??null,
      revokedAt:link.status==="revoked"?link.updatedAt.toISOString():null,paused:link.status==="paused",
      sourceRevision:link.destination.sourceRevision,brandVersionId:link.destination.brandVersionId,
    }]:[]),...overview(readSitePreviewShares(site.metadata))];
  });

/** An immutable, sanitized website snapshot is captured when the URL is
 * created. Editing the Site later never silently changes what recipients see.
 * The bearer token is returned once; only its digest is stored.
 */
export const createSitePreviewShare = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: siteIdSchema,
    expiresAfterDays: z.union([z.literal(7), z.literal(30), z.null()]),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor } = await authorizedShareSite(data.siteId);
    // Render outside the write transaction: the renderer uses its own canonical\n    // read queries and must not hold a Site row lock during rendering.\n    let stage = "render";\n    try {\n      const preview=await getPartnerWebsitePreview(actor);\n      stage = "transaction";\n      return await db.transaction(async tx => {\n      const [site] = await tx.select({
        id: sites.id, name: sites.name, organizationId: sites.organizationId,
        lifecycleStatus: sites.lifecycleStatus, metadata: sites.metadata,
        updatedAt: sites.updatedAt,
      }).from(sites).where(eq(sites.id, data.siteId)).for("update").limit(1);
      if (!site) throw new AuthorizationError("Site preview sharing scope");
      await assertPreviewSharingScope(actor, site, tx);
      if (site.lifecycleStatus === "closed") throw new AuthorizationError("closed Site");
      const existing = readSitePreviewShares(site.metadata);
      const now = new Date();
      const active = existing.filter(share => !share.revokedAt
        && (!share.expiresAt || Date.parse(share.expiresAt) > now.getTime()));
      const links=await previewLinks(site.id,tx);
      if (active.length + links.filter(link=>goLinkAvailability(link)==="available" || goLinkAvailability(link)==="paused").length >= 5)
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
        preview.currentRevision!==latest.revision ||
        preview.currentBrandVersionId!==brand.version.id ||
        !preview.previewPages["/"])
        throw new DomainError("UNAVAILABLE",
          "The website changed while preparing this share. Reload the saved revision and try again.");
      const shareId=randomUUID();
      stage = "snapshot-storage";
      const snapshot=await writeSitePreviewSnapshot(
        sitePreviewSnapshotKey(site.id,shareId),preview.previewPages);

      const expiresAt=data.expiresAfterDays===null?null:new Date(now.getTime()+data.expiresAfterDays*86_400_000);
      stage = "share-persistence";
      let entry:typeof siteGoLinks.$inferSelect|undefined;
      for(let attempt=0;attempt<5;attempt++){
        [entry]=await tx.insert(siteGoLinks).values({
          code:randomBytes(9).toString("base64url"),siteId:site.id,organizationId:site.organizationId,
          createdByPersonId:actor.actorPersonId!,name:"Website preview · Revision "+latest.revision,
          expiresAt,destination:{kind:"website-preview",snapshotId:shareId,snapshotDigest:snapshot.digest,
            sourceRevision:latest.revision,brandVersionId:brand.version.id},
        }).onConflictDoNothing({target:siteGoLinks.code}).returning();
        if(entry)break;
      }
      if(!entry)throw new DomainError("CONFLICT","Unable to issue a unique Go link.");
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
      // Do not log content, bearer credentials, SQL or raw provider errors.\n      console.error("Website preview share creation failed", { stage, errorType: error instanceof Error ? error.name : "unknown" });
      throw error;
    }
  });

/** Revocation is immediate for all pages because each anonymous GET checks
 * the stored share state. Never return the token or immutable HTML to callers.
 */
export const revokeSitePreviewShare = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: siteIdSchema, shareId: shareIdentifier,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor } = await authorizedShareSite(data.siteId);
    return db.transaction(async tx => {
      const [site] = await tx.select().from(sites)
        .where(eq(sites.id, data.siteId)).for("update").limit(1);
      if (!site) throw new AuthorizationError("Site preview sharing scope");
      await assertPreviewSharingScope(actor, site, tx);
      const [link]=await tx.select().from(siteGoLinks).where(and(eq(siteGoLinks.id,data.shareId),eq(siteGoLinks.siteId,site.id))).for("update").limit(1);
      if(link?.destination?.kind==="website-preview"){
        if(link.status==="revoked")return {changed:false};
        await tx.update(siteGoLinks).set({status:"revoked",updatedAt:new Date()}).where(eq(siteGoLinks.id,link.id));
        await writeAudit(tx,actor,{action:"site.go_link.revoke",entityType:"site_go_link",entityId:link.id,scope:{siteId:site.id,organizationId:site.organizationId},before:{status:link.status},after:{status:"revoked"}});
        await emitEvent(tx,{eventType:EventTypes.SiteWebsitePreviewRevoked,aggregateType:"site",aggregateId:site.id,actorPersonId:actor.actorPersonId,siteId:site.id,organizationId:site.organizationId,payload:{shareId:link.id,revokedAt:new Date().toISOString()}});
        return {changed:true};
      }
      const shares = readSitePreviewShares(site.metadata);
      const match = shares.find(entry => entry.id === data.shareId);
      if (!match) throw new DomainError("UNAVAILABLE", "This preview link no longer exists.");
      if (match.revokedAt) return { changed: false };
      const now = new Date().toISOString();
      await tx.update(sites).set({
        metadata: { ...site.metadata, websitePreviewSharesV1: shares.map(entry =>
          entry.id === data.shareId ? { ...entry, revokedAt: now } : entry) },
        updatedAt: nextSiteConfigurationRevision(site.updatedAt),
      }).where(eq(sites.id, site.id));
      await writeAudit(tx, actor, {
        action: "site.website.preview_share.revoked",
        entityType: "site", entityId: site.id,
        scope: { organizationId: site.organizationId, siteId: site.id },
        after: { shareId: data.shareId, revokedAt: now },
      });
      await emitEvent(tx, {
        eventType: EventTypes.SiteWebsitePreviewRevoked,
        aggregateType: "site", aggregateId: site.id,
        actorPersonId: actor.actorPersonId, siteId: site.id,
        organizationId: site.organizationId,
        payload: { shareId: data.shareId, revokedAt: now },
      });
      return { changed: true };
    });
  });
