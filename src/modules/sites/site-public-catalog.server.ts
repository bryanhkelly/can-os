import { projectApprovedParentInformation, withVerifiedPublicApplications } from "@/domain/parent-information";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, sitePublications, sites } from "@/db/schema";
import { isPublicSiteSlug, publicSiteHost } from "@/domain/public-site-address";
import { isSitePubliclyPublished, toPublicSiteEnrichment } from "@/domain/public-site-catalog";
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
    const academicPrograms = await readAcademicProgramCatalog(site.id, tx);
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
    return {
      parentInformation: projectApprovedParentInformation({
        site: { name: site.name, organizationName: site.organizationName },
        academicPrograms:authorizedPrograms, offerings: publicOfferings, localContent,
        ...parentExtras,
      }),
      demonstration: site.metadata?.synthetic === true,
      host: publicSiteHost(slug),
      site: { name: site.name, organizationName: site.organizationName },
      academicPrograms:authorizedPrograms,
      localContent,
      media,
      offerings: publicOfferings,
    };
  });
}
