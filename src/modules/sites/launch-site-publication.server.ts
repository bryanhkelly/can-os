import {parseCommandInput} from "@/domain/command-input";
import {DomainError} from "@/domain/errors";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteLocalContentVersions, sitePublications, sites } from "@/db/schema";
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
export const readLaunchSitePublicationInput=z.object({ siteId: z.string().uuid() }).strict();
export async function readLaunchSitePublicationService(request:Request,raw:unknown){
 const data=parseCommandInput(readLaunchSitePublicationInput,raw);
    const actor = await getCommandContext(request);
    const isLocalEditor = actor.role === "site_admin" || actor.role === "site_website_editor";
    // Reading Prepare must not require the power to approve website copy.
    // This also permits network-governed Site Admins to inspect blockers
    // without claiming they can independently approve or publish.
    const site = isLocalEditor
      ? await requirePartnerWebsiteEditor(actor, db, "site.website.draft.read")
      : await requireSitePublisher(actor, data.siteId);
    if (site.id !== data.siteId) throw new AuthorizationError("exact Site publication scope");
    let canPublishSite = false;
    try {
      // The actual Site publisher requires an independent active Person role
      // assignment, not merely a Site Admin or registrar capability.
      await requireSitePublisher(actor, data.siteId);
      canPublishSite = true;
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
    }

    const [[address], latest, localCopy, academic, enrichment, [brandPointer]] = await Promise.all([
      db.select({
        slug: sitePublications.slug,
        status: sitePublications.status,
        updatedAt: sitePublications.updatedAt,
        publishedAt: sitePublications.publishedAt,
        brandVersionId: sitePublications.brandVersionId,
        websiteContentRevision:sitePublications.websiteContentRevision,
        websiteTemplateId:sitePublications.websiteTemplateId,
      }).from(sitePublications).where(eq(sitePublications.siteId, site.id)).limit(1),
      db.select({ revision: siteLocalContentVersions.revision, status: siteLocalContentVersions.status })
        .from(siteLocalContentVersions).where(eq(siteLocalContentVersions.siteId, site.id))
        .orderBy(desc(siteLocalContentVersions.revision)).limit(1).then(rows => rows[0] ?? null),
      readCurrentLocalContent(site.id),
      readAcademicProgramCatalog(site.id),
      readEnrichmentCatalog(site.id),
      db.select({currentBrandVersionId:sites.currentBrandVersionId}).from(sites)
        .where(eq(sites.id,site.id)).limit(1),
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
      currentBrandVersionId:brandPointer?.currentBrandVersionId??null,
      publishedBrandVersionId:address?.brandVersionId??null,
      canRepublish:Boolean(address?.status==="published" && brandPointer?.currentBrandVersionId &&
        (brandPointer.currentBrandVersionId!==address.brandVersionId ||
          (localCopy?.revision??null)!==(address.websiteContentRevision??null) ||
          (localCopy?.content.branding?.templateId??"heritage")!==(address.websiteTemplateId??"heritage"))),
      approvedEnrichmentCount: enrichment.length,
      reviewedLocalContentAvailable: Boolean(localCopy),
      // The draft reader resolves the real local-publish capability,
      // including network governance and the exact active editor assignment.
      canReviewWebsiteCopy: isLocalEditor && "canPublish" in site && site.canPublish === true,
      canPublishSite,
      latestWebsiteRevision: latest?.revision ?? 0,
      latestWebsiteStatus: latest?.status ?? null,
      publishingPrerequisitesPresent: Boolean(localCopy) || academic.length + enrichment.length > 0,
      hostingConfigured: process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED === "true",
    };
}


/** Separate, explicit approval of the latest saved Site-owned website copy.
 * The existing local-content publisher rechecks rights and protected claims
 * under a revision-checked transaction. This NEVER publishes the Site shell.
 */
export const reviewLaunchSiteWebsiteCopyInput=z.object({
    siteId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    contentReviewed: z.literal(true),
  }).strict();
export async function reviewLaunchSiteWebsiteCopyService(request:Request,raw:unknown){
 const data=parseCommandInput(reviewLaunchSiteWebsiteCopyInput,raw);
    const actor = await getCommandContext(request);
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
      throw new DomainError("CONFLICT","The website changed since review. Refresh and inspect the latest copy.");
    if (latest.status === "review_required")
      throw new Error("This website contains protected institutional claims. Complete independent review or revise the copy.");
    if (latest.status === "published")
      return { changed: false, revision: latest.revision, status: "published" as const };
    const result = await publishPartnerLocalContent(actor, {
      operation: "save", expectedRevision: latest.revision, content: latest.content,
    });
    return { changed: result.changed, revision: result.revision, status: result.status };
}
