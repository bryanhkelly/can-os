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
      to_regclass('education_v30.noncredit_self_enrollment_releases') IS NOT NULL AS "releasesReady",
      CASE WHEN to_regclass('public.site_canonical_identity_links') IS NOT NULL
        THEN has_schema_privilege(current_user,'public','USAGE')
          AND has_schema_privilege(current_user,'education_v30','USAGE')
          AND has_table_privilege(current_user,'public.site_canonical_identity_links','SELECT')
          AND has_table_privilege(current_user,'education_v30.noncredit_self_enrollment_releases','SELECT')
        ELSE false END AS "canReadLink"
  `)).rows as Array<{mappingReady:boolean;releasesReady:boolean;canReadLink:boolean}>);
  if(!presence?.mappingReady||!presence.releasesReady||!presence.canReadLink)return [];

  const links=await executor.execute(sql`
    SELECT canonical_site_id AS "canonicalSiteId"
    FROM public.site_canonical_identity_links
    WHERE public_site_id=${publicSiteId}::uuid AND status='approved'
  `);
  if(links.rows.length!==1)return [];
  const link=linkedSiteSchema.parse(links.rows[0]);

  const candidates=await executor.select({id:noncreditSelfEnrollmentReleases.id})
    .from(noncreditSelfEnrollmentReleases)
    .where(and(
      eq(noncreditSelfEnrollmentReleases.siteId,link.canonicalSiteId),
      eq(noncreditSelfEnrollmentReleases.status,"published"),
    )).orderBy(noncreditSelfEnrollmentReleases.id)
    .limit(40);

  const eligible:SiteNoncreditListing[]=[];
  for(const candidate of candidates){
    // This service is already the source of truth for the national enrollment
    // catalog. Its result is not a grant and can become unavailable at any time.
    const [release]=await readEligibleSelfEnrollmentReleases(executor,candidate.id);
    if(!release||release.siteId!==link.canonicalSiteId)continue;
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

/** Optional content must never take down an otherwise approved Site website
 * if a restricted canonical reader loses permissions or its connection fails.
 * The registration endpoint remains independently fail-closed.
 */
export async function readOptionalSiteNoncreditReleases(
  publicSiteId:string,executor:Reader=db,
):Promise<SiteNoncreditListing[]> {
  try{return await readLinkedSiteNoncreditReleases(publicSiteId,executor);}
  catch(error){
    console.error("Optional Site noncredit catalog unavailable",{
      errorType:error instanceof Error?error.name:"unknown",
    });
    return [];
  }
}

export type SiteNoncreditReadiness={
  status:"migration_missing"|"reader_permission_missing"|"link_not_approved"|
    "no_enrollable_release"|"ready"|"reader_unavailable";
  eligibleReleaseCount:number;
};

/** One verification result for launch readiness. Publishing and actual
 * enrollment remain independently authorized; a Site link is not a grant.
 */
export async function inspectSiteNoncreditReadiness(
  publicSiteId:string,executor:Reader=db,
):Promise<SiteNoncreditReadiness>{
  const no=(status:SiteNoncreditReadiness["status"]):SiteNoncreditReadiness=>
    ({status,eligibleReleaseCount:0});
  try{
    const result=await executor.execute(sql`
      SELECT to_regclass('public.site_canonical_identity_links') IS NOT NULL AS "mappingReady",
        to_regclass('education_v30.noncredit_self_enrollment_releases') IS NOT NULL AS "releaseReady",
        has_schema_privilege(current_user,'public','USAGE') AS "publicSchema",
        has_schema_privilege(current_user,'education_v30','USAGE') AS "nativeSchema"
    `);
    const item=result.rows[0] as Record<string,unknown>|undefined;
    if(!item?.mappingReady||!item?.releaseReady)return no("migration_missing");
    if(!item.publicSchema||!item.nativeSchema)return no("reader_permission_missing");
    const link=await executor.execute(sql`
      SELECT 1 FROM public.site_canonical_identity_links
      WHERE public_site_id=${publicSiteId}::uuid AND status='approved' LIMIT 1
    `);
    if(!link.rows.length)return no("link_not_approved");
    const eligible=await readLinkedSiteNoncreditReleases(publicSiteId,executor);
    return {status:eligible.length?"ready":"no_enrollable_release",
      eligibleReleaseCount:eligible.length};
  }catch{return no("reader_unavailable");}
}
