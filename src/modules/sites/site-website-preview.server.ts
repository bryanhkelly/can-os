import { and, eq, isNull, sql } from "drizzle-orm";
import type { SiteLocalContent } from "@/domain/site-local-content";
import { readCurrentLocalContent, readLocalContentHistory } from "./site-local-content.server";
import { db } from "@/db/client";
import {
  memberships, organizations, people, roleAssignments,
  sitePublications, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import {
  assertPartnerWebsitePreviewScope, siteWebsiteDraftReadCapability,
} from "@/domain/site-publication-policy";
import { publicSiteHost } from "@/domain/public-site-address";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";

/**
 * PUB-18: A site editor sees only their active, site-specific membership's
 * public-safe draft projection. They NEVER receive the institutional publisher
 * DTO (which includes internal Programs) or any publisher mutation.
 *
 * Provisioning requires BOTH an active verified account-person grant with
 * role="site_website_editor", organizationId and siteId AND a same-person
 * role_assignment for the Site carrying "site.website.draft.read".
 * Neither a network agreement nor a general role creates these grants.
 */
type Reader = Pick<typeof db, "select">;

export async function requirePartnerWebsiteEditor(actor: AccessContext, executor: Reader = db) {
  const siteId = actor.grantSiteId;
  if (!siteId || !actor.actorPersonId || actor.role !== "site_website_editor") {
    throw new AuthorizationError("site-specific website editor membership");
  }

  const [site] = await executor.select({
    id: sites.id, organizationId: sites.organizationId,
    name: sites.name, organizationName: organizations.name,
  }).from(sites)
    .innerJoin(organizations, eq(organizations.id, sites.organizationId))
    .where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new AuthorizationError("partner website Site does not exist");
  assertPartnerWebsitePreviewScope(actor, site);

  const [assignment] = await executor.select({ id: roleAssignments.id })
    .from(roleAssignments)
    .innerJoin(memberships, and(
      eq(memberships.personId, roleAssignments.personId),
      eq(memberships.organizationId, roleAssignments.organizationId),
    ))
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .where(and(
      eq(roleAssignments.personId, actor.actorPersonId),
      eq(people.active, true),
      eq(roleAssignments.roleKey, "site_website_editor"),
      eq(roleAssignments.organizationId, site.organizationId),
      eq(roleAssignments.siteId, site.id),
      isNull(roleAssignments.programId),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify([siteWebsiteDraftReadCapability])}::jsonb`,
    )).limit(1);
  if (!assignment) throw new AuthorizationError("explicit Site website editor assignment");
  return site;
}

/** Public-safe private preview; institution-owned fields are still read-only. */
export async function getPartnerWebsitePreview(actor: AccessContext) {
  const site = await requirePartnerWebsiteEditor(actor);
  const [address] = await db.select({
    slug: sitePublications.slug, status: sitePublications.status,
  }).from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1);

  // The preview is a read-only projection of approved/public-safe data;
  // no drafts, student data, family contact details or staff roster escape.
  // Private Site status is irrelevant to independently approved listings.
  const academicPrograms = address ? await readAcademicProgramCatalog(site.id) : [];
  const offerings = address
    ? (await readEnrichmentCatalog(site.id)).map(toPublicSiteEnrichment)
    : [];
  const host = address ? publicSiteHost(address.slug) : null;
  const [local, history] = address ? await Promise.all([
    readCurrentLocalContent(site.id), readLocalContentHistory(site.id),
  ]) : [null, []];
  const editingContent: SiteLocalContent | null = history[0]?.content ?? local?.content ?? null;
  return {
    siteName: site.name,
    organizationName: site.organizationName,
    host,
    status: address?.status ?? null,
    approvedAcademicCount: academicPrograms.length,
    approvedEnrichmentCount: offerings.length,
    editingContent,
    currentRevision: history[0]?.revision ?? 0,
    localContentStatus: history[0]?.status ?? null,
    localHistory: history.map(item => ({ revision: item.revision, status: item.status,
      createdAt: item.createdAt.toISOString(), flaggedFields: item.flaggedFields,
      restoredFromRevision: item.restoredFromRevision })),
    previewHtml: host ? renderPublicSiteHtml({
      host,
      site: { name: site.name, organizationName: site.organizationName },
      academicPrograms, offerings, localContent: local?.content ?? null,
    }) : null,
  };
}
