import { eq } from "drizzle-orm";
import { projectApprovedParentInformation, withVerifiedPublicApplications } from "@/domain/parent-information";
import { projectPublicInformationReadiness } from "@/domain/public-information-readiness";
import { db } from "@/db/client";
import { sitePublications, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { publicSiteHost } from "@/domain/public-site-address";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import { toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { normalizeSiteLocalContent, siteLocalImagePublicationGaps, type SiteLocalContent } from "@/domain/site-local-content";
import { siteInformationSchema } from "@/domain/site-setup-configuration";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { readCurrentLocalContent, readLocalContentHistory } from "./site-local-content.server";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { readApprovedPublicParentExtras } from "./public-parent-extras.server";
import {readApprovedSchoolSitePhotos} from "./site-media-folder.server";
import {projectApprovedSchoolSiteMedia} from "@/domain/school-site-media-public";

/** Public-safe private preview; institution-owned fields are still read-only. */
export async function getPartnerWebsitePreview(actor: AccessContext, proposedContent?: SiteLocalContent) {
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
  const approvedPhotos = host ? await readApprovedSchoolSitePhotos(site.id) : [];
  const media = host ? projectApprovedSchoolSiteMedia(site.id,host,approvedPhotos) : {};
  const latestContent = history[0]?.content ?? local?.content;
  const editingContent: SiteLocalContent | null = latestContent
    ? normalizeSiteLocalContent(latestContent, { allowIncompleteImage: true }) : null;
  // Editor and full-page private previews use the latest saved immutable draft,
  // never the last published revision by accident. Unapproved child artwork
  // remains editable but cannot escape into preview HTML.
  const candidate = proposedContent ?? editingContent ?? local?.content ?? null;
  const previewContent = candidate && siteLocalImagePublicationGaps(candidate.branding.heroImage).length
    ? { ...candidate, branding: { ...candidate.branding, heroImage: null } }
    : candidate;
  const [siteConfiguration] = await db.select({metadata: sites.metadata})
    .from(sites).where(eq(sites.id, site.id)).limit(1);
  const siteInformation=siteInformationSchema.safeParse(siteConfiguration?.metadata?.siteInformation);
  const parentExtras = host ? await readApprovedPublicParentExtras(site.id,
    academicPrograms.map(program => program.programId), siteConfiguration?.metadata ?? null) : null;
  const authorizedPrograms=withVerifiedPublicApplications(academicPrograms,
    parentExtras?.admissions);
  const parentInformation = projectApprovedParentInformation({
    site: { name: site.name, organizationName: site.organizationName },
    academicPrograms:authorizedPrograms, offerings, localContent: previewContent,
    ...(parentExtras ?? {}),
  });
  const previewPage = host ? {
    demonstration: siteConfiguration?.metadata?.synthetic === true,
    host, site: { name: site.name, organizationName: site.organizationName },
    academicPrograms:authorizedPrograms, offerings, localContent: previewContent,
    parentInformation, media,
  } : null;
  const previewPages = previewPage
    ? Object.fromEntries(availablePublicSitePaths(previewPage).map(path => [
      path, renderPublicSiteHtml(previewPage, { path, localPreview: true }),
    ])) : {};
  return {
    siteId:site.id,
    siteName: site.name,
    organizationName: site.organizationName,
    canPublish: site.canPublish,
    canPrepareWebsite: actor.role === "site_admin",
    demonstration: siteConfiguration?.metadata?.synthetic === true,
    siteInformation:siteInformation.success?siteInformation.data:null,
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
      siteId: site.id,
      profile: parentInformation,
      marketingPublished: address?.status === "published",
      externalHostReachable: false,
      admissionsAuthorized: false,
      openingConfirmed: false,
    }),
    approvedEnrichmentCount: offerings.length,
    approvedPhotoCount: approvedPhotos.length,
    mediaUploadsEnabled: process.env.CAN_R2_SITE_MEDIA_UPLOADS_ENABLED === "true",
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
