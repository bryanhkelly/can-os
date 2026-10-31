import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sitePublications } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { publicSiteHost } from "@/domain/public-site-address";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { normalizeSiteLocalContent, type SiteLocalContent } from "@/domain/site-local-content";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { readCurrentLocalContent, readLocalContentHistory } from "./site-local-content.server";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";

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
  return {
    siteId:site.id,
    siteName: site.name,
    organizationName: site.organizationName,
    canPublish: site.canPublish,
    host,
    status: address?.status ?? null,
    approvedAcademicCount: academicPrograms.length,
    approvedEnrichmentCount: offerings.length,
    editingContent,
    currentRevision: history[0]?.revision ?? 0,
    localContentStatus: history[0]?.status ?? null,
    localHistory: history.map(item => ({ revision: item.revision, status: item.status,
      createdAt: item.createdAt.toISOString(), flaggedFields: item.flaggedFields,
      restoredFromRevision: item.restoredFromRevision })),
    previewHtml: host ? renderPublicSiteHtml({
      host,
      site: { name: site.name, organizationName: site.organizationName },
      academicPrograms, offerings, localContent: local?.content ?? null,
    }) : null,
  };
}
