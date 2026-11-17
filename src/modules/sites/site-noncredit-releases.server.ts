import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { readEligibleSelfEnrollmentReleases } from "@/modules/enrollment/noncredit-self-enrollment-catalog.server";
import type { SiteNoncreditListing } from "@/domain/site-noncredit-public";
import {siteCatalogReaderAccessible,type SiteNoncreditPreflight} from "@/domain/site-noncredit-catalog-readiness";

type Reader=Pick<typeof db,"select"|"execute">;
const uuid=z.string().uuid();

/** Permission checks use the actual active connection, not a guessed role.
 * A Site has the SAME UUID everywhere, with no Site identity crosswalk. */
export async function probeSiteNoncreditCatalogReader(
  executor:Reader=db,
):Promise<SiteNoncreditPreflight>{
  const result=await executor.execute(sql`
    SELECT to_regclass('public.sites') IS NOT NULL AS "sitesReady",
      to_regclass('education_v30.noncredit_self_enrollment_releases') IS NOT NULL AS "releasesReady",
      has_schema_privilege(current_user,'public','USAGE') AS "publicSchema",
      has_schema_privilege(current_user,'education_v30','USAGE') AS "nativeSchema",
      CASE WHEN to_regclass('public.sites') IS NOT NULL
        THEN has_table_privilege(current_user,'public.sites','SELECT')
        ELSE false END AS "siteRead",
      CASE WHEN to_regclass('education_v30.noncredit_self_enrollment_releases') IS NOT NULL
        THEN has_table_privilege(current_user,'education_v30.noncredit_self_enrollment_releases','SELECT')
        ELSE false END AS "releaseRead"
  `);
  const row=result.rows[0] as SiteNoncreditPreflight|undefined;
  if(!row)throw new Error("Site enrollment reader readiness unavailable");
  return row;
}

/** Read publicly released noncredit training under the one Site UUID.
 * The owning enrollment service rechecks current approval, adoption,
 * consent, capacity and timing. No direct writes or permission inference. */
export async function readLinkedSiteNoncreditReleases(
  publicSiteId:string,executor:Reader=db,
):Promise<SiteNoncreditListing[]>{
  if(!uuid.safeParse(publicSiteId).success)return [];
  const preflight=await probeSiteNoncreditCatalogReader(executor);
  if(!siteCatalogReaderAccessible(preflight))return [];

  // A native service is not provisioned merely because the platform Site
  // exists. Exact-ID matching replaces the old independently approved bridge.
  const matching=await executor.execute(sql`
    SELECT 1 FROM public.sites platform_site
    WHERE platform_site.id=${publicSiteId}::uuid
      AND platform_site.lifecycle_status='active'
    LIMIT 1
  `);
  if(matching.rows.length!==1)return [];
  const releases=await readEligibleSelfEnrollmentReleases(executor,undefined,{
    siteId:publicSiteId,limit:40,
  });
  return releases.filter(release=>release.siteId===publicSiteId).map(release=>({
    releaseId:release.id,
    title:release.title,
    siteName:release.siteName??"",
    seatsRemaining:release.seatsRemaining,
    waitlistAvailable:release.seatsRemaining<=0 || release.hasWaitingQueue,
  }));
}

/** Optional public content never takes down an approved website.
 * Actual registration independently checks enrollment authorization. */
export async function readOptionalSiteNoncreditReleases(
  publicSiteId:string,executor:Reader=db,
):Promise<SiteNoncreditListing[]>{
  try{return await readLinkedSiteNoncreditReleases(publicSiteId,executor);}
  catch(error){
    console.error("Optional Site noncredit catalog unavailable",{
      errorType:error instanceof Error?error.name:"unknown",
    });
    return [];
  }
}

export type SiteNoncreditReadiness={
  status:"migration_missing"|"reader_permission_missing"|"site_not_provisioned"|
    "no_enrollable_release"|"ready"|"reader_unavailable";
  eligibleReleaseCount:number;
};

export async function inspectSiteNoncreditReadiness(
  publicSiteId:string,executor:Reader=db,
):Promise<SiteNoncreditReadiness>{
  const no=(status:SiteNoncreditReadiness["status"]):SiteNoncreditReadiness=>
    ({status,eligibleReleaseCount:0});
  if(!uuid.safeParse(publicSiteId).success)return no("site_not_provisioned");
  try{
    const state=await probeSiteNoncreditCatalogReader(executor);
    if(!state.sitesReady||!state.releasesReady)return no("migration_missing");
    if(!siteCatalogReaderAccessible(state))return no("reader_permission_missing");
    const matching=await executor.execute(sql`
      SELECT 1 FROM public.sites platform_site
      WHERE platform_site.id=${publicSiteId}::uuid
        AND platform_site.lifecycle_status='active' LIMIT 1
    `);
    if(matching.rows.length!==1)return no("site_not_provisioned");
    const eligible=await readLinkedSiteNoncreditReleases(publicSiteId,executor);
    return {status:eligible.length?"ready":"no_enrollable_release",
      eligibleReleaseCount:eligible.length};
  }catch(error){
    const details=error instanceof Error?error.message:"";
    return no(/permission denied|insufficient privilege|42501/i.test(details)
      ?"reader_permission_missing":"reader_unavailable");
  }
}
