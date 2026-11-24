import {sql,type SQL} from "drizzle-orm";
import {db} from "@/db/client";
import {physicalSiteAddressSchema,siteAddressEditorDraft} from "@/domain/site-setup-configuration";
import {isDemoTenantOrganization} from "@/modules/identity/demo-school-tenants.server";
import {type GeographicResolution,type GeographicAreaFact,type CommunityProfile} from "@/domain/geographic-intelligence";
import {createCensusGeographyProvider,type GeographyProvider} from "./census-geography-provider.server";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader=Pick<typeof db,"execute">;
async function rows<T>(reader:Reader,query:SQL):Promise<T[]>{
 return (await reader.execute(query)).rows as unknown as T[];
}
// Explicit release dataset. Refresh with a reviewed version change, not an unversioned moving query.
const ACS_YEAR=2024;
type Work={site_id:string;organization_id:string;generation:string;lease_id:string;attempts:number;address:unknown;eligible:boolean};
async function claimSite():Promise<Work|undefined>{
 return db.transaction(async tx=>{
  await tx.execute(sql`UPDATE public.site_geography_jobs SET status='failed',lease_id=NULL,lease_until=NULL,updated_at=now()
   WHERE status='processing' AND lease_until<now() AND attempts>=4`);
  const [work]=await rows<Work>(tx,sql`
    WITH candidate AS (SELECT j.site_id FROM public.site_geography_jobs j
      WHERE j.next_attempt_at<=now() AND j.attempts<4
       AND (j.status='pending' OR (j.status='processing' AND j.lease_until<now()))
      ORDER BY j.next_attempt_at,j.site_id LIMIT 1 FOR UPDATE SKIP LOCKED),
    claimed AS (UPDATE public.site_geography_jobs j SET status='processing',attempts=attempts+1,
      lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
      FROM candidate c WHERE j.site_id=c.site_id RETURNING j.*)
    SELECT j.site_id,j.organization_id,j.generation,j.lease_id,j.attempts,s.address,public.site_geography_eligible(s.site_kind,s.metadata,s.address) AS eligible FROM claimed j
    JOIN public.sites s ON s.id=j.site_id AND s.organization_id=j.organization_id`);
  return work;
 });
}
async function areaVersion(tx:Tx,area:GeographicAreaFact,result:GeographicResolution){
 // Preserve the canonical state/catalog level, name and parent. Versioned observations carry source names.
 const [canonical]=await rows<{id:string}>(tx,sql`INSERT INTO public.geographic_areas(code,name,level_code)
 VALUES(${area.code},${area.name},${area.kind}) ON CONFLICT(code) DO UPDATE SET code=excluded.code RETURNING id`);
 if(!canonical)throw new Error("geography_canonical_area_missing");
 const [version]=await rows<{id:string}>(tx,sql`INSERT INTO public.geographic_area_versions(area_id,source,benchmark,vintage,name,kind,source_id)
 VALUES(${canonical.id},${result.source},${result.benchmark},${result.vintage},${area.name},${area.kind},${area.sourceId})
 ON CONFLICT(area_id,source,benchmark,vintage) DO UPDATE SET area_id=excluded.area_id RETURNING id`);
 if(!version)throw new Error("geography_area_version_missing");
 return version.id;
}
async function finishSite(work:Work,status:"resolved"|"unresolved"|"unsupported"|"retry",result?:GeographicResolution){
 await db.transaction(async tx=>{
  // Match generation and lease; a new address invalidates a stale worker's result.
  const [job]=await rows<{site_id:string}>(tx,sql`SELECT j.site_id FROM public.site_geography_jobs j
   WHERE j.site_id=${work.site_id} AND j.organization_id=${work.organization_id}
   AND j.generation=${work.generation} AND j.lease_id=${work.lease_id}
   AND j.status='processing' AND j.lease_until>now() FOR UPDATE`);
  if(!job)return;
  if(result&&status==="resolved"){
   const [version]=await rows<{id:string}>(tx,sql`INSERT INTO public.site_geography_versions
    (site_id,organization_id,generation,source,benchmark,vintage,latitude,longitude,market_status)
    VALUES(${work.site_id},${work.organization_id},${work.generation},${result.source},${result.benchmark},${result.vintage},${result.latitude},${result.longitude},${result.marketStatus}) RETURNING id`);
   if(!version)throw new Error("geography_site_version_missing");
   const ids=new Map<string,string>();
   // Stable lock order avoids conflicts when two Sites share areas.
   for(const area of [...result.areas].sort((a,b)=>a.code.localeCompare(b.code))){
    const id=await areaVersion(tx,area,result);ids.set(area.kind,id);
    await tx.execute(sql`INSERT INTO public.site_geographic_memberships VALUES(${version.id},${id}) ON CONFLICT DO NOTHING`);
    if(["county","metro","micro"].includes(area.kind)){
     await tx.execute(sql`INSERT INTO public.geographic_profile_jobs(area_version_id,year)
       VALUES(${id},${ACS_YEAR}) ON CONFLICT DO NOTHING`);
    }
   }
   // Only express relationships that are valid for the whole area, not point overlap.
   const link=async(child:string|undefined,parent:string|undefined,relationship:string)=>{
    if(child&&parent)await tx.execute(sql`INSERT INTO public.geographic_area_relationships VALUES(${child},${parent},${relationship}) ON CONFLICT DO NOTHING`);
   };
   await link(ids.get("county"),ids.get("state"),"contained_in");
   await link(ids.get("tract"),ids.get("county"),"contained_in");
   await link(ids.get("state"),ids.get("country"),"contained_in");
   await link(ids.get("state"),ids.get("region"),"contained_in");
   const market=ids.get("metro")??ids.get("micro");
   await link(ids.get("county"),market,"market_member");
   await link(market,ids.get("csa"),"contained_in");
  }
  const final=status==="retry"?(work.attempts>=4?"failed":"pending"):status;
  await tx.execute(sql`UPDATE public.site_geography_jobs SET status=${final},lease_id=NULL,lease_until=NULL,
   next_attempt_at=now()+(${Math.min(60,2**work.attempts)}*interval '1 minute'),updated_at=now()
   WHERE site_id=${work.site_id} AND generation=${work.generation} AND lease_id=${work.lease_id}`);
 });
}
type ProfileWork={area_version_id:string;area_id:string;year:number;lease_id:string;attempts:number;code:string;name:string;kind:GeographicAreaFact["kind"];source_id:string};
async function claimProfile(){
 return db.transaction(async tx=>{
  await tx.execute(sql`UPDATE public.geographic_profile_jobs SET status='failed',lease_id=NULL,lease_until=NULL
   WHERE status='processing' AND lease_until<now() AND attempts>=4`);
  const [work]=await rows<ProfileWork>(tx,sql`WITH candidate AS (
   SELECT area_version_id,year FROM public.geographic_profile_jobs WHERE attempts<4 AND next_attempt_at<=now()
   AND (status='pending' OR (status='processing' AND lease_until<now()))
   ORDER BY next_attempt_at,area_version_id LIMIT 1 FOR UPDATE SKIP LOCKED),
   claimed AS (UPDATE public.geographic_profile_jobs j SET status='processing',attempts=attempts+1,
    lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes' FROM candidate c
    WHERE j.area_version_id=c.area_version_id AND j.year=c.year RETURNING j.*)
   SELECT j.*,v.area_id,v.name,v.kind,v.source_id,a.code FROM claimed j
   JOIN public.geographic_area_versions v ON v.id=j.area_version_id JOIN public.geographic_areas a ON a.id=v.area_id`);
  return work;
 });
}
async function finishProfile(work:ProfileWork,profile:CommunityProfile|null,retry=false){
 await db.transaction(async tx=>{
  const [job]=await rows<{area_version_id:string}>(tx,sql`SELECT area_version_id FROM public.geographic_profile_jobs
   WHERE area_version_id=${work.area_version_id} AND year=${work.year} AND lease_id=${work.lease_id}
   AND status='processing' AND lease_until>now() FOR UPDATE`);
  if(!job)return;
  if(profile)await tx.execute(sql`INSERT INTO public.geographic_community_profiles(area_id,source,year,indicators)
   VALUES(${work.area_id},'acs5',${profile.year},${JSON.stringify(profile.indicators)}::jsonb) ON CONFLICT DO NOTHING`);
  const status=profile?"resolved":retry?(work.attempts>=4?"failed":"pending"):"unresolved";
  await tx.execute(sql`UPDATE public.geographic_profile_jobs SET status=${status},lease_id=NULL,lease_until=NULL,
   next_attempt_at=now()+(${Math.min(60,2**work.attempts)}*interval '1 minute')
   WHERE area_version_id=${work.area_version_id} AND year=${work.year} AND lease_id=${work.lease_id}`);
 });
}
/** Bounded scheduled work. External calls never occur inside DB transactions or UI reads. */
export async function processGeographicIntelligence(options:{provider?:GeographyProvider;apiKey?:string}={}){
 const apiKey=options.apiKey??process.env.CENSUS_DATA_API_KEY;
 const provider=options.provider??createCensusGeographyProvider({apiKey});
 const work=await claimSite();
 if(work){
  try{
   const address=physicalSiteAddressSchema.safeParse(siteAddressEditorDraft(work.address));
   if(!work.eligible||!address.success||address.data.country!=="US"||await isDemoTenantOrganization(work.organization_id)){
    await finishSite(work,"unsupported");
   }else{
    const result=await provider.resolve(address.data);
    await finishSite(work,result?"resolved":"unresolved",result??undefined);
   }
  }catch{await finishSite(work,"retry");}
 }
 // A missing key leaves work pending, not falsely resolved or exhausted.
 if(apiKey){
  const profileWork=await claimProfile();
  if(profileWork){
   try{
    const [cached]=await rows<{present:number}>(db,sql`SELECT 1 AS present FROM public.geographic_community_profiles
     WHERE area_id=${profileWork.area_id} AND source='acs5' AND year=${profileWork.year}`);
    if(cached){
     await db.execute(sql`UPDATE public.geographic_profile_jobs SET status='resolved',lease_id=NULL,lease_until=NULL
       WHERE area_version_id=${profileWork.area_version_id} AND year=${profileWork.year} AND lease_id=${profileWork.lease_id}`);
    }else{
     const result=await provider.communityProfile({code:profileWork.code,name:profileWork.name,kind:profileWork.kind,sourceId:profileWork.source_id},profileWork.year);
     await finishProfile(profileWork,result);
    }
   }catch{await finishProfile(profileWork,null,true);}
  }
 }
}
