import { readSavedBrandVersion } from "./site-brand.server";
import { siteBrandPresentationIdentity } from "@/domain/site-brand";
import { resolveSiteTemplateId } from "@/domain/site-theme";
import { projectPlannedSiteProgramsForPreview } from "@/domain/site-program-preview";
import { suggestWebsiteCopyFromStory, prepareWebsiteCopyFromSiteInformation } from "@/domain/site-website-story-suggestions";
import { eq, sql } from "drizzle-orm";
import { siteStorySourceV61Schema } from "@/domain/site-information-v61";
import { recommendBrandDirection } from "@/domain/site-brand-direction";
import { projectApprovedParentInformation, withVerifiedPublicApplications } from "@/domain/parent-information";
import { readOptionalSiteNoncreditReleases } from "./site-noncredit-releases.server";
import { readOptionalSitePublishedClasses } from "./site-published-classes.server";
import { noncreditEnrollmentOrigin } from "@/domain/site-noncredit-public";
import { projectSiteEnrollmentOpportunities } from "@/domain/site-enrollment-opportunities";
import { projectPublicInformationReadiness } from "@/domain/public-information-readiness";
import { db } from "@/db/client";
import { organizations, siteAffiliations, sitePublications, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { publicSiteHost } from "@/domain/public-site-address";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import { safeReadSiteContentChannelConfig, readPublishedSiteContentChannelConfig, resolveSiteContentBlocks, websitePreviewEditorialBlocks } from "@/domain/site-content-channels";
import { siteLaunchPreferencesSchema } from "@/domain/site-launch-preferences";
import { toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { createSchoolWebsiteStarterContent, normalizeSiteLocalContent, safeSiteWebsitePreviewContent, type SiteLocalContent } from "@/domain/site-local-content";
import { schoolPlanningLocationSchema } from "@/domain/school-stub";
import { readSitePhysicalAddress, siteInformationSchema } from "@/domain/site-setup-configuration";
import { canonicalPublicContact, publicIdentityReviewStatuses } from "@/domain/public-parent-identity";
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
  const [siteConfiguration] = await db.select({metadata: sites.metadata,address:sites.address,timezone:sites.timezone})
    .from(sites).where(eq(sites.id, site.id)).limit(1);
  const siteInformation=siteInformationSchema.safeParse(siteConfiguration?.metadata?.siteInformation);
  const siteStorySource=siteStorySourceV61Schema.safeParse(siteConfiguration?.metadata?.siteStoryV61);
  const storyCandidates=siteStorySource.success
    ? suggestWebsiteCopyFromStory(siteStorySource.data.answers,site.name) : [];
  const savedBrand=await readSavedBrandVersion(site.id);
  const latestContent = history[0]?.content ?? local?.content;
  const rawEditingContent: SiteLocalContent | null = latestContent
    ? normalizeSiteLocalContent(latestContent, { allowIncompleteImage: true }) : null;
  // The saved identity comes ONLY from site_brand_versions. Website history
  // stores the structural wireframe, not colors, logo, fonts or direction.
  const editingContent:SiteLocalContent|null=rawEditingContent && savedBrand
    ? {...rawEditingContent,branding:siteBrandPresentationIdentity(savedBrand.resolved,
        resolveSiteTemplateId(rawEditingContent.branding.templateId),true)}
    : rawEditingContent;
  // Editor and full-page private previews use the latest saved immutable draft,
  // never the last published revision by accident. Unapproved child artwork
  // remains editable but cannot escape into preview HTML.
  // A new Site can explore a complete read-only design even before its first
  // saved draft. The starter is never persisted or published by this GET.
  const candidate = proposedContent ?? editingContent ?? local?.content
    ?? prepareWebsiteCopyFromSiteInformation(createSchoolWebsiteStarterContent(site.name),storyCandidates);
  // A newly established Site can save its Brand before its first website
  // revision. Apply that canonical Brand to the first-visit starter, not the
  // legacy default palette. In-editor unsaved previews retain their proposed
  // visual choices, without persisting a second Brand source.
  const renderedCandidate = savedBrand && !proposedContent
    ? {...candidate,branding:siteBrandPresentationIdentity(savedBrand.resolved,
        resolveSiteTemplateId(candidate.branding.templateId),true)}
    : candidate;
  const displaySiteName = savedBrand?.resolved.displayName ?? site.name;
  // The same rights gate applies to both artwork slots, including saved private drafts.
  // Unsigned logos must never bypass the hero-image gate in a private HTML preview.
  const previewContent = safeSiteWebsitePreviewContent(renderedCandidate);
  const parentExtras = host ? await readApprovedPublicParentExtras(site.id,
    academicPrograms.map(program => program.programId), siteConfiguration?.metadata ?? null) : null;
  const authorizedPrograms=withVerifiedPublicApplications(academicPrograms,
    parentExtras?.admissions);
  const parentInformation = projectApprovedParentInformation({
    site: { name: displaySiteName, organizationName: site.organizationName },
    academicPrograms:authorizedPrograms, offerings, localContent: previewContent,
    ...(parentExtras ?? {}),
  });
  // Canonical release cards belong to the Site renderer, not the parent
  // information projection. Fetch only after independently approved data
  // is assembled; the optional read fails closed without breaking preview.
  const noncreditReleases = host ? await readOptionalSiteNoncreditReleases(site.id) : [];
  const classes = host ? await readOptionalSitePublishedClasses(site.id) : [];
  const enrollmentAppOrigin=noncreditEnrollmentOrigin(process.env.CAN_ACCESS_PUBLIC_ORIGIN);
  const enrollmentOpportunities=projectSiteEnrollmentOpportunities({
    academicPrograms:authorizedPrograms,enrichment:offerings,
    noncredit:noncreditReleases,classes,enrollmentOrigin:enrollmentAppOrigin,
  });
  const contentConfig = safeReadSiteContentChannelConfig(siteConfiguration?.metadata?.websiteContentChannels);
  const publishedContentConfig = readPublishedSiteContentChannelConfig(
    siteConfiguration?.metadata?.publishedWebsiteContentChannels);
  const preferences = siteLaunchPreferencesSchema.safeParse(siteConfiguration?.metadata?.launchPreferences);
  const planningLocation = schoolPlanningLocationSchema.safeParse(siteConfiguration?.metadata?.schoolPlanningLocation);
  const sourceIdentityReviews = publicIdentityReviewStatuses(
    site.id, siteConfiguration?.address ?? null, siteConfiguration?.metadata ?? null);
  const savedPhysicalAddress = readSitePhysicalAddress(siteConfiguration?.address).value !== null;
  const savedPublicContact = canonicalPublicContact(siteConfiguration?.metadata?.setupContact) !== null;
  // Show actual reviewed affiliation statuses only to Site-scoped users
  // holding network read authority; never generate public network claims.
  const networkRows=actor.capabilities.has("network.affiliations.read")
    ? await db.select({name:organizations.name,status:siteAffiliations.status})
        .from(siteAffiliations)
        .innerJoin(organizations,eq(organizations.id,siteAffiliations.denominationOrganizationId))
        .where(eq(siteAffiliations.siteId,site.id)).limit(20)
    : null;
  const networkAffiliations=networkRows?.flatMap(row=>
    (["pending","approved","rejected","revoked"] as const).includes(
      row.status as "pending"|"approved"|"rejected"|"revoked")
      ? [{name:row.name,status:row.status as "pending"|"approved"|"rejected"|"revoked"}] : []) ?? null;
  const baseContentBlocks = resolveSiteContentBlocks(
    contentConfig, {
      mode: "private", preferences: preferences.success ? preferences.data : null,
      siteSetup:{name:displaySiteName,organizationName:site.organizationName,
        city:planningLocation.success?planningLocation.data.city:null,
        state:planningLocation.success?planningLocation.data.state:null,
        timezone:siteConfiguration?.timezone??null},
      networkAffiliations,networkStatusKnown:networkRows!==null,
      academicPrograms: authorizedPrograms, enrichment: offerings,
      noncredit: noncreditReleases, classes, classTimezone:siteConfiguration?.timezone??null,
      enrollmentOrigin: noncreditEnrollmentOrigin(process.env.CAN_ACCESS_PUBLIC_ORIGIN),
    });

  // Website previews show the full Site vision, including planned Program categories.
  // They do not require an adopted Solution or grant registration authority.
  const proposedPrograms = projectPlannedSiteProgramsForPreview(
    preferences.success ? preferences.data : null, baseContentBlocks);
  const contentBlocks = [
    ...websitePreviewEditorialBlocks(baseContentBlocks),
    ...proposedPrograms,
  ];
  const previewPage = host ? {
    demonstration: siteConfiguration?.metadata?.synthetic === true,
    host, site: { name: displaySiteName, organizationName: site.organizationName },
    academicPrograms:authorizedPrograms, offerings, localContent: previewContent,
    parentInformation, media, contentBlocks, enrollmentOpportunities,
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
    currentBrandVersionId:savedBrand?.version.id??null,
    currentBrandRevision:savedBrand?.version.revision??0,
    currentBrandConfiguration:savedBrand?.version.configuration??null,
    siteStoryRecommendation:siteStorySource.success ? recommendBrandDirection(siteStorySource.data.answers) : null,
    siteStoryCopyCandidates:storyCandidates,
    siteStorySourceChoices:siteStorySource.success ? {
      motivations:siteStorySource.data.answers.motivations,
      distinctives:siteStorySource.data.answers.distinctives,
      values:siteStorySource.data.answers.values,
      experiences:siteStorySource.data.answers.experiences,
    } : null,
    siteStoryRevision:siteStorySource.success ? siteStorySource.data.revision : null,
    siteName: site.name,
    organizationName: site.organizationName,
    canEdit: site.canEdit,
    canPublish: site.canPublish,
    draftStorageReady,
    canPrepareWebsite: actor.role === "site_admin",
    demonstration: siteConfiguration?.metadata?.synthetic === true,
    siteInformation:siteInformation.success?siteInformation.data:null,
    // Reuse the exact Site-owned layout document from Launch, not a cloned
    // editor model or a second website configuration record.
    contentChannelConfig: contentConfig,
    // Single-source mapping diagnostics for the authenticated Website & Brand
    // review step. Private setup facts never become public claims here.
    sourceMapping: {
      physicalAddressSaved: savedPhysicalAddress,
      physicalAddressReview: sourceIdentityReviews.address,
      contactSaved: savedPublicContact,
      contactReview: sourceIdentityReviews.contact,
      schoolContextSaved: siteInformation.success,
      learningIntentSaved: preferences.success,
      contentChannelDraftRevision: contentConfig.revision,
      contentChannelPublishedRevision: publishedContentConfig.revision,
      contentChannelsPublished: publishedContentConfig.revision > 0,
      publicAddressVisible: parentInformation.site.address.canDisplay,
      publicContactVisible: parentInformation.site.contact.canDisplay,
    },
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
