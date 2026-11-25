import {sql} from "drizzle-orm";
import {db} from "@/db/client";
import type {AccessContext} from "@/domain/access-context";
import type {CommunityProfile,GeographyKind} from "@/domain/geographic-intelligence";
import {loadAuthorizedSiteReportingScope} from "@/modules/insights/site-reporting-source-scope.server";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type AreaRow={code:string;name:string;kind:GeographyKind;source_id:string;year:number|null;indicators:CommunityProfile["indicators"]|null};
type Version={id:string;market_status:string;source:string;benchmark:string;vintage:string;resolved_at:string};
/** Internal reader: callers MUST establish exact Site and organization authority in the same transaction. */
export async function readScopedSiteGeography(tx:Tx,scope:{id:string;organizationId:string},asOf=new Date()){
 const result=await tx.execute(sql`SELECT id,market_status,source,benchmark,vintage,resolved_at FROM public.site_geography_versions
  WHERE site_id=${scope.id} AND organization_id=${scope.organizationId}
  AND resolved_at<=${asOf} AND (superseded_at IS NULL OR superseded_at>${asOf})
  ORDER BY resolved_at DESC LIMIT 1`);
 const version=(result.rows as unknown as Version[])[0];
 if(!version){
  const job=await tx.execute(sql`SELECT status FROM public.site_geography_jobs WHERE site_id=${scope.id} AND organization_id=${scope.organizationId} AND updated_at<=${asOf}`);
  return {status:(job.rows[0]?.status as string|undefined)??"unknown",market:null,areas:[],communityProfiles:[],version:null};
 }
 const membership=await tx.execute(sql`SELECT a.code,v.name,v.kind,v.source_id,p.year,p.indicators
 FROM public.site_geographic_memberships m JOIN public.geographic_area_versions v ON v.id=m.area_version_id
 JOIN public.geographic_areas a ON a.id=v.area_id LEFT JOIN LATERAL (
  SELECT year,indicators FROM public.geographic_community_profiles WHERE area_id=a.id AND source='acs5'
   AND retrieved_at<=${asOf} ORDER BY year DESC LIMIT 1
 ) p ON true WHERE m.site_geography_version_id=${version.id} ORDER BY a.code`);
 const areas=(membership.rows as unknown as AreaRow[]);
 const facts=areas.map(a=>({code:a.code,name:a.name,kind:a.kind,sourceId:a.source_id}));
 return {status:"resolved",market:facts.find(a=>a.kind==="metro"||a.kind==="micro")??null,areas:facts,
  communityProfiles:areas.filter(a=>a.year!==null&&a.indicators!==null).map(a=>({areaCode:a.code,source:"acs5" as const,year:a.year!,indicators:a.indicators!})),version};
}
export async function readAuthorizedSiteGeography(actor:AccessContext,siteId:string,asOf?:Date){
 return db.transaction(async tx=>readScopedSiteGeography(tx,await loadAuthorizedSiteReportingScope(tx,actor,siteId),asOf),{isolationLevel:"repeatable read",accessMode:"read only"});
}
