import { eq } from "drizzle-orm";
import { projectApprovedParentInformation, withVerifiedPublicApplications } from "@/domain/parent-information";
import { projectPublicInformationReadiness } from "@/domain/public-information-readiness";
import { db } from "@/db/client";
import { sitePublications, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { publicSiteHost } from "@/domain/public-site-address";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import { toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { normalizeSiteLocalContent, type SiteLocalContent } from "@/domain/site-local-content";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { readCurrentLocalContent, readLocalContentHistory } from "./site-local-content.server";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { readApprovedPublicParentExtras } from "./public-parent-extras.server";

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
  const local = address ? await readCurrentLocalContent(site.id) : null;
  const history = address ? await readLocalContentHistory(site.id) : [];
  const latestContent = history[0]?.content ?? local?.content;
  const editingContent: SiteLocalContent | null = latestContent
    ? normalizeSiteLocalContent(latestContent) : null;
  const [siteConfiguration] = host ? await db.select({metadata: sites.metadata})
    .from(sites).where(eq(sites.id, site.id)).limit(1) : [];
  const parentExtras = host ? await readApprovedPublicParentExtras(site.id,
    academicPrograms.map(program => program.programId), siteConfiguration?.metadata ?? null) : {};
  const authorizedPrograms=withVerifiedPublicApplications(academicPrograms,
    "admissions" in parentExtras ? parentExtras.admissions : undefined);
  const parentInformation = projectApprovedParentInformation({
    site: { name: site.name, organizationName: site.organizationName },
    academicPrograms:authorizedPrograms, offerings, localContent: local?.content ?? null,
    ...parentExtras,
  });
  const previewPage = host ? {
    demonstration: siteConfiguration?.metadata?.synthetic === true,
    host, site: { name: site.name, organizationName: site.organizationName },
    academicPrograms:authorizedPrograms, offerings, localContent: local?.content ?? null,
    parentInformation,
  } : null;
  const previewPages = previewPage
    ? Object.fromEntries(availablePublicSitePaths(previewPage).map(path => [
      path, renderPublicSiteHtml(previewPage, { path }),
    ])) : {};
  return {
    siteId:site.id,
    siteName: site.name,
    organizationName: site.organizationName,
    canPublish: site.canPublish,
    demonstration: siteConfiguration?.metadata?.synthetic === true,
    host,
    status: address?.status ?? null,
    approvedAcademicCount: academicPrograms.length,
    // Same canonical, approved-only parent DTO as the live Site projection.
    // Draft copy and internal review history remain separate editor-only fields.
    parentInformation,
    // Public information completeness is a diagnostic only. We cannot infer
    // host reachability, admission authorization or opening authority from a
    // reserved/publication row, even for a synthetic reference school.
    publicInformationReadiness: projectPublicInformationReadiness({
      profile: parentInformation,
      marketingPublished: address?.status === "published",
      externalHostReachable: false,
      admissionsAuthorized: false,
      openingConfirmed: false,
    }),
    approvedEnrichmentCount: offerings.length,
    editingContent,
    currentRevision: history[0]?.revision ?? 0,
    localContentStatus: history[0]?.status ?? null,
    localHistory: history.map(item => ({ revision: item.revision, status: item.status,
      createdAt: item.createdAt.toISOString(), flaggedFields: item.flaggedFields,
      restoredFromRevision: item.restoredFromRevision })),
    previewHtml: previewPages["/"] ?? null,
    previewPages,
  };
}
