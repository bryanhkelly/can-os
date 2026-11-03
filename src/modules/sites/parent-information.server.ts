import { readPublishedSiteCatalog } from "./site-public-catalog.server";
import { isPublicSiteSlug } from "@/domain/public-site-address";

/**
 * PX-005–007. Live anonymous reads go through the existing Site lock,
 * agreement-aware Program read and enrichment registration gate.
 * Never accept an arbitrary Site ID or client-supplied claim authority.
 */
export async function readPublishedParentInformation(slug: string) {
  if (!isPublicSiteSlug(slug)) return null;
  const published = await readPublishedSiteCatalog(slug);
  if (!published) return null;
  // Preserve the publication-locked, owner-approved calendar and service
  // fragments. Re-projecting here would silently drop their evidence.
  return published.parentInformation;
}
