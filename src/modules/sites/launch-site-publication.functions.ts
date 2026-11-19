import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sitePublications } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { publicSiteHost } from "@/domain/public-site-address";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { readCurrentLocalContent } from "./site-local-content.server";
import { requireSitePublisher } from "./site-publication.server";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";

/** Read-only Prepare projection. Publication writes remain exclusively in the
 * existing reviewed Site publisher. This does not create a second approval.
 */
export const readLaunchSitePublication = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ siteId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    const site = actor.role === "site_admin"
      ? await requirePartnerWebsiteEditor(actor, db, "site.website.local.publish")
      : await requireSitePublisher(actor, data.siteId);
    if (site.id !== data.siteId) throw new AuthorizationError("exact Site publication scope");

    const [[address], localCopy, academic, enrichment] = await Promise.all([
      db.select({
        slug: sitePublications.slug,
        status: sitePublications.status,
        updatedAt: sitePublications.updatedAt,
        publishedAt: sitePublications.publishedAt,
      }).from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1),
      readCurrentLocalContent(site.id),
      readAcademicProgramCatalog(site.id),
      readEnrichmentCatalog(site.id),
    ]);
    return {
      siteId: site.id,
      siteName: site.name,
      address: address ? {
        host: publicSiteHost(address.slug),
        status: address.status,
        revision: address.updatedAt.toISOString(),
        publishedAt: address.publishedAt?.toISOString() ?? null,
      } : null,
      approvedAcademicCount: academic.length,
      approvedEnrichmentCount: enrichment.length,
      reviewedLocalContentAvailable: Boolean(localCopy),
      publishingPrerequisitesPresent: Boolean(localCopy) || academic.length + enrichment.length > 0,
      hostingConfigured: process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true",
    };
  });
