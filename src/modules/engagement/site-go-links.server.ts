import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteGoLinks, sitePublications, sites } from "@/db/schema";
import { goCodeSchema, goDestinationHref } from "@/domain/site-go-links";
import { publicSiteHost } from "@/domain/public-site-address";

/** Read-only public resolver. A code carries no Person, enrollment or Site grant. */
export async function resolveSiteGoLink(code: string): Promise<string | null> {
  if (!goCodeSchema.safeParse(code).success) return null;
  const [link] = await db.select({
    destination: siteGoLinks.destination, status: siteGoLinks.status,
    siteId: siteGoLinks.siteId, organizationId: siteGoLinks.organizationId,
  }).from(siteGoLinks).where(eq(siteGoLinks.code, code)).limit(1);
  if (!link || link.status !== "active") return null;

  const [site] = await db.select({
    id: sites.id, organizationId: sites.organizationId, lifecycleStatus: sites.lifecycleStatus,
  }).from(sites).where(eq(sites.id, link.siteId)).limit(1);
  if (!site || site.organizationId !== link.organizationId || site.lifecycleStatus === "closed") return null;

  let publishedHost: string | null = null;
  if (link.destination.kind === "site-page") {
    const [publication] = await db.select({
      slug: sitePublications.slug, status: sitePublications.status,
      publishedAt: sitePublications.publishedAt,
    }).from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1);
    if (!publication || publication.status !== "published" || !publication.publishedAt) return null;
    publishedHost = publicSiteHost(publication.slug);
  }
  return goDestinationHref(link.destination, code, publishedHost);
}
