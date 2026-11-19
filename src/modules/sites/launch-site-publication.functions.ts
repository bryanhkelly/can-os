import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteLocalContentVersions, sitePublications } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { publicSiteHost } from "@/domain/public-site-address";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { publishPartnerLocalContent, readCurrentLocalContent } from "./site-local-content.server";
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
    const site = actor.role === "site_admin" || actor.role === "site_website_editor"
      ? await requirePartnerWebsiteEditor(actor, db, "site.website.local.publish")
      : await requireSitePublisher(actor, data.siteId);
    if (site.id !== data.siteId) throw new AuthorizationError("exact Site publication scope");

    const [[address], latest, localCopy, academic, enrichment] = await Promise.all([
      db.select({
        slug: sitePublications.slug,
        status: sitePublications.status,
        updatedAt: sitePublications.updatedAt,
        publishedAt: sitePublications.publishedAt,
      }).from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1),
      db.select({ revision: siteLocalContentVersions.revision, status: siteLocalContentVersions.status })
        .from(siteLocalContentVersions).where(eq(siteLocalContentVersions.siteId, site.id))
        .orderBy(desc(siteLocalContentVersions.revision)).limit(1).then(rows => rows[0] ?? null),
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
      canReviewWebsiteCopy: actor.role === "site_admin" || actor.role === "site_website_editor",
      latestWebsiteRevision: latest?.revision ?? 0,
      latestWebsiteStatus: latest?.status ?? null,
      publishingPrerequisitesPresent: Boolean(localCopy) || academic.length + enrichment.length > 0,
      hostingConfigured: process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true",
    };
  });


/** Separate, explicit approval of the latest saved Site-owned website copy.
 * The existing local-content publisher rechecks rights and protected claims
 * under a revision-checked transaction. This NEVER publishes the Site shell.
 */
export const reviewLaunchSiteWebsiteCopy = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    siteId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    contentReviewed: z.literal(true),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    const site = await requirePartnerWebsiteEditor(actor, db, "site.website.local.publish");
    if (site.id !== data.siteId) throw new AuthorizationError("exact Site website review scope");
    const [latest] = await db.select({
      revision: siteLocalContentVersions.revision,
      status: siteLocalContentVersions.status,
      content: siteLocalContentVersions.content,
    }).from(siteLocalContentVersions)
      .where(eq(siteLocalContentVersions.siteId, site.id))
      .orderBy(desc(siteLocalContentVersions.revision)).limit(1);
    if (!latest)
      throw new Error("Save the Site website design in Establish before approving its public copy.");
    if (latest.revision !== data.expectedRevision)
      throw new Error("The website changed since review. Refresh and inspect the latest copy.");
    if (latest.status === "review_required")
      throw new Error("This website contains protected institutional claims. Complete independent review or revise the copy.");
    if (latest.status === "published")
      return { changed: false, revision: latest.revision, status: "published" as const };
    const result = await publishPartnerLocalContent(actor, {
      operation: "save", expectedRevision: latest.revision, content: latest.content,
    });
    return { changed: result.changed, revision: result.revision, status: result.status };
  });
