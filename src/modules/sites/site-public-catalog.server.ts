import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, sitePublications, sites } from "@/db/schema";
import { isPublicSiteSlug, publicSiteHost } from "@/domain/public-site-address";
import { isSitePubliclyPublished, toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { readCurrentLocalContent } from "./site-local-content.server";

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
    return {
      host: publicSiteHost(slug),
      site: { name: site.name, organizationName: site.organizationName },
      academicPrograms,
      localContent: locallyPublished?.content ?? null,
      offerings: offerings.map(toPublicSiteEnrichment),
    };
  });
}
