import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, sitePublications, sites } from "@/db/schema";
import { isPublicSiteSlug, publicSiteHost } from "@/domain/public-site-address";
import { isSitePubliclyPublished, toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";

/**
 * Read-only public Site projection. It is intentionally independent of the
 * draft editor and of authenticated Site/Program management APIs.
 *
 * No site has been approved for public publication by the current commands;
 * a reserved/draft subdomain always returns null (a caller can render 404).
 */
export async function readPublishedSiteCatalog(slug: string) {
  if (!isPublicSiteSlug(slug)) return null;
  // Hold a shared lock on the publication decision throughout its catalog
  // projection. Unpublish takes FOR UPDATE and cannot complete between the
  // initial public check and reading Site offerings.
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
    )).for("share").limit(1);
  if (!site || !isSitePubliclyPublished(site)) return null;

  const offerings = await readEnrichmentCatalog(site.id, tx);
  return {
    host: publicSiteHost(slug),
    site: { name: site.name, organizationName: site.organizationName },
    offerings: offerings.map(toPublicSiteEnrichment),
  };
  });
}
