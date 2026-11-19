import { readSavedBrandVersion } from "./site-brand.functions";
import { siteBrandPresentationIdentity } from "@/domain/site-brand";
import { safeReadSiteContentChannelConfig, resolveSiteContentBlocks } from "@/domain/site-content-channels";
import { siteLaunchPreferencesSchema } from "@/domain/site-launch-preferences";
import { projectPlannedSiteProgramsForPreview } from "@/domain/site-program-preview";
import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organizations, siteLocalContentVersions, sites } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import {
  classifySiteLocalContent, normalizeSiteLocalContent,
} from "@/domain/site-local-content";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import {
  createPreviewShareToken, projectShareableSitePreview, readSitePreviewShares, type SitePreviewShare,
} from "@/domain/site-preview-sharing";
import { nextSiteConfigurationRevision } from "@/domain/site-setup-configuration";
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
    const editor = await requirePartnerWebsiteEditor(actor, executor, "site.website.local.publish");
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

function overview(shares: readonly SitePreviewShare[]) {
  return shares.map(share => ({
    id: share.id, createdAt: share.createdAt, expiresAt: share.expiresAt,
    revokedAt: share.revokedAt, sourceRevision: share.sourceRevision,
    brandVersionId:share.brandVersionId??null,
  }));
}

/** Authenticated operators see metadata only, never any previously-issued token. */
export const listSitePreviewShares = createServerFn({ method: "GET" })
  .validator((value: unknown) => previewParams.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { site } = await authorizedShareSite(data.siteId);
    return overview(readSitePreviewShares(site.metadata));
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
    return db.transaction(async tx => {
      const [site] = await tx.select({
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
      if (active.length >= 5)
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

      // The shared public-safe projection never exports the Site Story,
      // family contacts, unapproved imagery, or private editorial baseline.
      const [organization] = await tx.select({ name: organizations.name })
        .from(organizations).where(eq(organizations.id, site.organizationId)).limit(1);
      // Saved Programs & Audiences are part of the proposed website, not merely
      // private configuration. Use the existing bounded planning content channel
      // for display, with zero independent enrollment or publication actions.
      const preferences = siteLaunchPreferencesSchema.safeParse(site.metadata.launchPreferences);
      const authored = preferences.success
        ? resolveSiteContentBlocks(
            safeReadSiteContentChannelConfig(site.metadata.websiteContentChannels),
            { mode: "private", preferences: preferences.data },
          )
        : [];
      const plannedPrograms = projectPlannedSiteProgramsForPreview(
        preferences.success ? preferences.data : null, authored);
      const page = projectShareableSitePreview({
        siteName: brand.resolved.displayName,
        organizationName: organization?.name ?? "Proposed learning community",
        content:websiteContent,
        plannedPrograms,
      });
      const pages = Object.fromEntries(availablePublicSitePaths(page).map(path => [
        path, renderPublicSiteHtml(page, { path, localPreview: true }),
      ]));
      if (JSON.stringify(pages).length > 1_500_000)
        throw new DomainError("UNAVAILABLE", "The preview is too large to share. Reduce the size of the website artwork and try again.");

      const { token, tokenDigest } = createPreviewShareToken();
      const entry: SitePreviewShare = {
        id: randomUUID(), tokenDigest,
        createdAt: now.toISOString(),
        expiresAt: data.expiresAfterDays === null ? null
          : new Date(now.getTime() + data.expiresAfterDays * 86_400_000).toISOString(),
        revokedAt: null, sourceRevision: latest.revision,
        brandVersionId:brand.version.id,pages,
      };
      // Keep a bounded number of recorded links. Old revocations remain in
      // the canonical audit trail, not unlimited Site metadata.
      const keep = [...existing].reverse().filter(item => active.some(a => a.id === item.id))
        .slice(0, 5).reverse();
      const revision = nextSiteConfigurationRevision(site.updatedAt);
      await tx.update(sites).set({
        metadata: { ...site.metadata, websitePreviewSharesV1: [...keep, entry] },
        updatedAt: revision,
      }).where(eq(sites.id, site.id));
      await writeAudit(tx, actor, {
        action: "site.website.preview_share.created",
        entityType: "site", entityId: site.id,
        scope: { organizationId: site.organizationId, siteId: site.id },
        after: { shareId: entry.id, sourceRevision: entry.sourceRevision,
          brandVersionId:brand.version.id,
          expiresAt: entry.expiresAt, proposed: true, officialPublication: false },
      });
      await emitEvent(tx, {
        eventType: EventTypes.SiteWebsitePreviewShared,
        aggregateType: "site", aggregateId: site.id,
        actorPersonId: actor.actorPersonId, siteId: site.id,
        organizationId: site.organizationId,
        payload: { shareId: entry.id, sourceRevision: entry.sourceRevision,
          expiresAt: entry.expiresAt },
      });
      return {
        shareId: entry.id, token,
        relativeUrl: "/site-preview-share?" + new URLSearchParams({
          siteId: site.id, token,
        }).toString(),
        expiresAt: entry.expiresAt, sourceRevision: entry.sourceRevision,
      };
    });
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
