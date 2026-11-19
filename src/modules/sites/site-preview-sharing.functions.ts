import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { organizations, siteLocalContentVersions, sites } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import {
  classifySiteLocalContent, createSchoolWebsiteStarterContent, normalizeSiteLocalContent,
  siteLocalImagePublicationGaps,
} from "@/domain/site-local-content";
import { availablePublicSitePaths, renderPublicSiteHtml, type PublicSitePage } from "@/domain/public-site-html";
import {
  createPreviewShareToken, readSitePreviewShares, type SitePreviewShare,
} from "@/domain/site-preview-sharing";
import { nextSiteConfigurationRevision } from "@/domain/site-setup-configuration";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const siteIdSchema = z.string().uuid();
const shareIdentifier = z.string().uuid();
const previewParams = z.object({ siteId: siteIdSchema }).strict();

async function authorizedShareSite(siteId: string) {
  const actor = await getCommandContext(getRequest());
  const [site] = await db.select({
    id: sites.id, organizationId: sites.organizationId, name: sites.name,
    lifecycleStatus: sites.lifecycleStatus, metadata: sites.metadata,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  assertSiteSetupScope(actor, site, "program.launch.start");
  if (site.lifecycleStatus === "closed")
    throw new DomainError("UNAVAILABLE", "A closed Site cannot share a new preview.");
  return { actor, site };
}

function overview(shares: readonly SitePreviewShare[]) {
  return shares.map(share => ({
    id: share.id, createdAt: share.createdAt, expiresAt: share.expiresAt,
    revokedAt: share.revokedAt, sourceRevision: share.sourceRevision,
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
      assertSiteSetupScope(actor, site, "program.launch.start");
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
      const content = latest
        ? normalizeSiteLocalContent(latest.content, { allowIncompleteImage: true })
        : createSchoolWebsiteStarterContent(site.name);
      if (latest?.status === "review_required" || classifySiteLocalContent(content).status !== "published")
        throw new DomainError("UNAVAILABLE",
          "This website revision contains protected claims needing review. Update your website copy before sharing.");

      // Consent and licensing gaps never leave the editor. Editorial baseline,
      // private Site Story, contacts, network claims and admissions are excluded.
      const safeContent = {
        ...content,
        editorialBaseline: undefined,
        branding: {
          ...content.branding,
          heroImage: siteLocalImagePublicationGaps(content.branding.heroImage).length ? null : content.branding.heroImage,
          logoImage: siteLocalImagePublicationGaps(content.branding.logoImage ?? null).length ? null : content.branding.logoImage ?? null,
        },
      };
      const [organization] = await tx.select({ name: organizations.name })
        .from(organizations).where(eq(organizations.id, site.organizationId)).limit(1);
      const page: PublicSitePage = {
        host: "preview.can-os.com",
        site: { name: site.name, organizationName: organization?.name ?? "Proposed learning community" },
        localContent: safeContent,
        offerings: [],
        academicPrograms: [],
        noncreditReleases: [],
        enrollmentOpportunities: [],
        contentBlocks: [],
        media: {},
      };
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
        revokedAt: null, sourceRevision: latest?.revision ?? 0, pages,
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
      assertSiteSetupScope(actor, site, "program.launch.start");
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
