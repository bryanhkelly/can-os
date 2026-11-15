import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { readEligibleSelfEnrollmentReleases } from "@/modules/enrollment/noncredit-self-enrollment-catalog.server";
import type { SiteNoncreditListing } from "@/domain/site-noncredit-public";
import {siteCatalogReaderAccessible,type SiteNoncreditPreflight} from "@/domain/site-noncredit-bridge";

type Reader=Pick<typeof db,"select"|"execute">;
const linkedSiteSchema=z.object({canonicalSiteId:z.string().uuid()}).strict();

/** Probe actual runtime connection privileges, never credential-string shape.
 * The restricted native-session reader is deliberately not the public Site
 * catalog reader. Approved mapping and CAN's full eligibility rules still
 * restrict the fields that the public HTML can receive.
 */
export async function probeSiteNoncreditCatalogReader(
  executor:Reader=db,
):Promise<SiteNoncreditPreflight>{
  const result=await executor.execute(sql`
    SELECT to_regclass('public.site_canonical_identity_links') IS NOT NULL AS "mappingReady",
      to_regclass('education_v30.noncredit_self_enrollment_releases') IS NOT NULL AS "releasesReady",
      has_schema_privilege(current_user,'public','USAGE') AS "publicSchema",
      has_schema_privilege(current_user,'education_v30','USAGE') AS "nativeSchema",
      CASE WHEN to_regclass('public.site_canonical_identity_links') IS NOT NULL
        THEN has_table_privilege(current_user,'public.site_canonical_identity_links','SELECT')
        ELSE false END AS "mappingRead",
      CASE WHEN to_regclass('education_v30.noncredit_self_enrollment_releases') IS NOT NULL
        THEN has_table_privilege(current_user,'education_v30.noncredit_self_enrollment_releases','SELECT')
        ELSE false END AS "releaseRead"
  `);
  const row=result.rows[0] as SiteNoncreditPreflight|undefined;
  if(!row)throw new Error("Site enrollment reader readiness unavailable");
  return row;
}
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
  const preflight=await probeSiteNoncreditCatalogReader(executor);
  if(!siteCatalogReaderAccessible(preflight))return [];
  // These empty reads prove this connection can actually SELECT both
  // relations rather than relying only on PostgreSQL permission metadata.
  await executor.execute(sql`SELECT 1 FROM public.site_canonical_identity_links LIMIT 0`);
  await executor.execute(sql`SELECT 1 FROM education_v30.noncredit_self_enrollment_releases LIMIT 0`);

  const links=await executor.execute(sql`
    SELECT canonical_site_id AS "canonicalSiteId"
    FROM public.site_canonical_identity_links
    WHERE public_site_id=${publicSiteId}::uuid AND status='approved'
  `);
  if(links.rows.length!==1)return [];
  const link=linkedSiteSchema.parse(links.rows[0]);

  // The existing eligibility reader already composes every approval,
  // effective-date, Site relationship, consent and capacity gate. Fetch
  // the exact canonical Site once and aggregate seats/waitlists in four
  // bounded queries rather than re-running the entire reader for 40 IDs.
  // The Site ID predicate is applied INSIDE the database eligibility query.
  const releases=await readEligibleSelfEnrollmentReleases(executor,undefined,{
    siteId:link.canonicalSiteId,limit:40,
  });
  const eligible:SiteNoncreditListing[]=releases
    .filter(release=>release.siteId===link.canonicalSiteId)
    .map(release=>({
      releaseId:release.id,
      title:release.title,
      siteName:release.siteName??"",
      seatsRemaining:release.seatsRemaining,
      waitlistAvailable:release.seatsRemaining<=0 || release.hasWaitingQueue,
    }));
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
    const state=await probeSiteNoncreditCatalogReader(executor);
    if(!state.mappingReady||!state.releasesReady)return no("migration_missing");
    if(!siteCatalogReaderAccessible(state))return no("reader_permission_missing");
    await executor.execute(sql`SELECT 1 FROM public.site_canonical_identity_links LIMIT 0`);
    await executor.execute(sql`SELECT 1 FROM education_v30.noncredit_self_enrollment_releases LIMIT 0`);
    const link=await executor.execute(sql`
      SELECT 1 FROM public.site_canonical_identity_links
      WHERE public_site_id=${publicSiteId}::uuid AND status='approved' LIMIT 1
    `);
    if(!link.rows.length)return no("link_not_approved");
    const eligible=await readLinkedSiteNoncreditReleases(publicSiteId,executor);
    return {status:eligible.length?"ready":"no_enrollable_release",
      eligibleReleaseCount:eligible.length};
  }catch(error){
    const details=error instanceof Error?error.message:"";
    return no(/permission denied|insufficient privilege|42501/i.test(details)
      ?"reader_permission_missing":"reader_unavailable");
  }
}
