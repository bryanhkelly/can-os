import { eq, sql } from "drizzle-orm";
import { projectApprovedParentInformation, withVerifiedPublicApplications } from "@/domain/parent-information";
import { readOptionalSiteNoncreditReleases } from "./site-noncredit-releases.server";
import { noncreditEnrollmentOrigin } from "@/domain/site-noncredit-public";
import { projectPublicInformationReadiness } from "@/domain/public-information-readiness";
import { db } from "@/db/client";
import { sitePublications, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { publicSiteHost } from "@/domain/public-site-address";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import { safeReadSiteContentChannelConfig, resolveSiteContentBlocks } from "@/domain/site-content-channels";
import { siteLaunchPreferencesSchema } from "@/domain/site-launch-preferences";
import { toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { createSchoolWebsiteStarterContent, normalizeSiteLocalContent, siteLocalImagePublicationGaps, type SiteLocalContent } from "@/domain/site-local-content";
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
  // Read-only environment check: legacy databases reject status='draft'
  // until migration 0077 is applied. Do not offer a save that must fail.
  const draftConstraint = await db.execute(sql`
    SELECT pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.site_local_content_versions')
      AND c.conname = 'site_local_content_status_ck'
    LIMIT 1
  `);
  const draftStorageReady = draftConstraint.rows.some(row =>
    typeof row.definition === "string" && row.definition.includes("'draft'"));
  const latestContent = history[0]?.content ?? local?.content;
  const editingContent: SiteLocalContent | null = latestContent
    ? normalizeSiteLocalContent(latestContent, { allowIncompleteImage: true }) : null;
  // Editor and full-page private previews use the latest saved immutable draft,
  // never the last published revision by accident. Unapproved child artwork
  // remains editable but cannot escape into preview HTML.
  // A new Site can explore a complete read-only design even before its first
  // saved draft. The starter is never persisted or published by this GET.
  const candidate = proposedContent ?? editingContent ?? local?.content
    ?? createSchoolWebsiteStarterContent(site.name);
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
  // Canonical release cards belong to the Site renderer, not the parent
  // information projection. Fetch only after independently approved data
  // is assembled; the optional read fails closed without breaking preview.
  const noncreditReleases = host ? await readOptionalSiteNoncreditReleases(site.id) : [];
  const contentConfig = safeReadSiteContentChannelConfig(siteConfiguration?.metadata?.websiteContentChannels);
  const preferences = siteLaunchPreferencesSchema.safeParse(siteConfiguration?.metadata?.launchPreferences);
  const contentBlocks = resolveSiteContentBlocks(
    contentConfig, {
      mode: "private", preferences: preferences.success ? preferences.data : null,
      academicPrograms: authorizedPrograms, enrichment: offerings,
      noncredit: noncreditReleases,
      enrollmentOrigin: noncreditEnrollmentOrigin(process.env.CAN_ACCESS_PUBLIC_ORIGIN),
    });
  const previewPage = host ? {
    demonstration: siteConfiguration?.metadata?.synthetic === true,
    host, site: { name: site.name, organizationName: site.organizationName },
    academicPrograms:authorizedPrograms, offerings, localContent: previewContent,
    parentInformation, media, contentBlocks,
    ...(noncreditReleases.length ? {
      noncreditReleases,
      enrollmentAppOrigin:noncreditEnrollmentOrigin(process.env.CAN_ACCESS_PUBLIC_ORIGIN),
    } : {}),
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
    draftStorageReady,
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
