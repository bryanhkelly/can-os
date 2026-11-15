import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { noncreditSelfEnrollmentReleases } from "@/db/canonical-v301";
import { readEligibleSelfEnrollmentReleases } from "@/modules/enrollment/noncredit-self-enrollment-catalog.server";
import type { SiteNoncreditListing } from "@/domain/site-noncredit-public";

type Reader=Pick<typeof db,"select"|"execute">;
const linkedSiteSchema=z.object({canonicalSiteId:z.string().uuid()}).strict();

/**
 * Website-safe, opt-in cross-schema projection.
 *
 * The independent public Site ↔ canonical Site correspondence must have
 * reviewer-approved evidence. The existing enrollment release reader performs
 * all current authorization, consent, seat, adoption, deployment and timing
 * checks. Neither names nor caller-provided canonical IDs establish a link.
 */
export async function readLinkedSiteNoncreditReleases(
  publicSiteId:string,
  executor:Reader=db,
):Promise<SiteNoncreditListing[]> {
  // Older production databases do not yet have this additive mapping.
  // Do not break their existing published Site websites.
  const [presence]=((await executor.execute(sql`
    SELECT to_regclass('public.site_canonical_identity_links') IS NOT NULL AS "mappingReady",
      to_regclass('education_v30.noncredit_self_enrollment_releases') IS NOT NULL AS "releasesReady"
  `)).rows as Array<{mappingReady:boolean;releasesReady:boolean}>);
  if(!presence?.mappingReady||!presence.releasesReady)return [];

  const links=await executor.execute(sql`
    SELECT canonical_site_id AS "canonicalSiteId"
    FROM public.site_canonical_identity_links
    WHERE public_site_id=${publicSiteId}::uuid AND status='approved'
    FOR SHARE
  `);
  if(links.rows.length!==1)return [];
  const link=linkedSiteSchema.parse(links.rows[0]);

  const candidates=await executor.select({id:noncreditSelfEnrollmentReleases.id})
    .from(noncreditSelfEnrollmentReleases)
    .where(and(
      eq(noncreditSelfEnrollmentReleases.siteId,link.canonicalSiteId),
      eq(noncreditSelfEnrollmentReleases.deliveryMode,"facilitated"),
      eq(noncreditSelfEnrollmentReleases.status,"published"),
    )).orderBy(noncreditSelfEnrollmentReleases.id)
    .limit(40).for("share");

  const eligible:SiteNoncreditListing[]=[];
  for(const candidate of candidates){
    // This service is already the source of truth for the national enrollment
    // catalog. Its result is not a grant and can become unavailable at any time.
    const [release]=await readEligibleSelfEnrollmentReleases(executor,candidate.id);
    if(!release||release.siteId!==link.canonicalSiteId||release.deliveryMode!=="facilitated")continue;
    eligible.push({
      releaseId:release.id,
      title:release.title,
      siteName:release.siteName??"",
      seatsRemaining:release.seatsRemaining,
      waitlistAvailable:release.seatsRemaining<=0 || release.hasWaitingQueue,
    });
  }
  return eligible;
}
