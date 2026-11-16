import { projectApprovedParentInformation, withVerifiedPublicApplications } from "@/domain/parent-information";
import { siteContentChannelConfigSchema, defaultSiteContentChannelConfig, resolveSiteContentBlocks } from "@/domain/site-content-channels";
import { readOptionalSiteNoncreditReleases } from "./site-noncredit-releases.server";
import { noncreditEnrollmentOrigin } from "@/domain/site-noncredit-public";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, programs, sitePublications, sites } from "@/db/schema";
import { isPublicSiteSlug, publicSiteHost } from "@/domain/public-site-address";
import { isSitePubliclyPublished, toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { isAcademicMarketingType } from "@/domain/academic-program-publication";
import { AuthorizationError } from "@/domain/command-context";
import { requireCurrentSchoolJurisdictionForOpening } from "@/modules/programs/school-jurisdiction-opening-gate.server";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { readCurrentLocalContent } from "./site-local-content.server";
import { readApprovedPublicParentExtras } from "./public-parent-extras.server";
import {readApprovedSchoolSitePhotos} from "./site-media-folder.server";
import {projectApprovedSchoolSiteMedia} from "@/domain/school-site-media-public";

/**
 * Public Site projection, independently gated by an approved Site publication
 * and each offering's existing season publication/registration checks.
 * Draft/unpublished Sites return null before any catalog query.
 */
export async function readPublishedSiteCatalog(slug: string) {
  if (!isPublicSiteSlug(slug)) return null;
  // A shared lock on the publication row prevents an unpublish write from
  // completing between the public status check and the catalog projection.
  return db.transaction(async tx => {
    const [site] = await tx.select({
      id: sites.id,
      name: sites.name,
      metadata: sites.metadata,
      organizationName: organizations.name,
      status: sitePublications.status,
      publishedAt: sitePublications.publishedAt,
    }).from(sitePublications)
      .innerJoin(sites, eq(sites.id, sitePublications.siteId))
      .innerJoin(organizations, eq(organizations.id, sites.organizationId))
      .where(and(
        eq(sitePublications.slug, slug),
        eq(sitePublications.status, "published"),
        isNotNull(sitePublications.publishedAt),
      )).for("share", { of: sitePublications }).limit(1);
    if (!site || !isSitePubliclyPublished(site)) return null;

    // Use the same locked transaction sequentially, avoiding concurrent
    // statements on one database connection.
    const offerings = await readEnrichmentCatalog(site.id, tx);
    const academicCandidates = await readAcademicProgramCatalog(site.id, tx);
    // Marketing approval and legal operating readiness are separate decisions.
    // Keep independently reviewed Program copy visible even while the school
    // is still completing its opening review; admissions and enrollment
    // commands enforce their own current authority and readiness gates.
    const academicPrograms = academicCandidates;
    const activePrograms=await tx.select({id:programs.id,type:programs.type}).from(programs)
      .where(and(eq(programs.siteId,site.id),eq(programs.status,"active"))).limit(25);
    const activeAcademicPrograms=activePrograms.filter(item=>isAcademicMarketingType(item.type));
    let operatingStatus: "authorized"|"development"|"review_required"=
      activeAcademicPrograms.length?"authorized":"development";
    for(const program of activeAcademicPrograms){
      try{
        await requireCurrentSchoolJurisdictionForOpening(tx,program.id,{});
      }catch(error){
        if(!(error instanceof AuthorizationError))throw error;
        operatingStatus="review_required";
        break;
      }
    }
    const locallyPublished = await readCurrentLocalContent(site.id, tx);
    const approvedPhotos = await readApprovedSchoolSitePhotos(site.id,tx);
    const media = projectApprovedSchoolSiteMedia(site.id,publicSiteHost(slug),approvedPhotos);
    const publicOfferings = offerings.map(toPublicSiteEnrichment);
    const localContent = locallyPublished?.content ?? null;
    // Same publication-locked, independently approved fragments used by
    // the authorized private editor; no draft services or invented weekday defaults.
    const parentExtras = await readApprovedPublicParentExtras(site.id,
      academicPrograms.map(program => program.programId), site.metadata, tx);
    // The existing academic catalog's service-level applicationOpen is not
    // sufficient for a public Apply CTA. The actual family-start command also
    // requires a current, positive-capacity academic-year seat pool. Keep the
    // renderer's Program-level button and the parent DTO on the SAME decision.
    const authorizedPrograms = withVerifiedPublicApplications(academicPrograms, parentExtras.admissions);
    const noncreditReleases = await readOptionalSiteNoncreditReleases(site.id, tx);
    const enrollmentAppOrigin = noncreditEnrollmentOrigin(process.env.CAN_ACCESS_PUBLIC_ORIGIN);
    const parsedContentChannels = siteContentChannelConfigSchema.safeParse(site.metadata.websiteContentChannels);
    const contentBlocks = resolveSiteContentBlocks(
      parsedContentChannels.success ? parsedContentChannels.data : defaultSiteContentChannelConfig, {
        mode: "public", academicPrograms: authorizedPrograms,
        enrichment: publicOfferings, noncredit: noncreditReleases,
        enrollmentOrigin: enrollmentAppOrigin,
      });
    return {
      parentInformation: projectApprovedParentInformation({
        site: { name: site.name, organizationName: site.organizationName },
        academicPrograms:authorizedPrograms, offerings: publicOfferings, localContent,
        ...parentExtras,
      }),
      demonstration: site.metadata?.synthetic === true,
      operatingStatus,
      host: publicSiteHost(slug),
      site: { name: site.name, organizationName: site.organizationName },
      academicPrograms:authorizedPrograms,
      localContent,
      media,
      offerings: publicOfferings,
      contentBlocks,
      ...(noncreditReleases.length ? { noncreditReleases, enrollmentAppOrigin } : {}),
    };
  });
}
