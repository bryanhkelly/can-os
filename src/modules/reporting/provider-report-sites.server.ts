import {and,asc,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {sites} from "@/db/schema";
import {authorizedReportSite,type ReportSiteOption} from "@/domain/report-filter-state";
type ProviderSiteScope={organizationId:string;siteIds:readonly string[]};
type Reader=Pick<typeof db,"select">;
function ownedSites(scope:ProviderSiteScope){
  return and(eq(sites.organizationId,scope.organizationId),inArray(sites.id,[...scope.siteIds]));
}
/** Options are not grants. Callers must resolve the provider capability first. */
export async function listProviderReportSites(reader:Reader,scope:ProviderSiteScope):Promise<ReportSiteOption[]>{
  if(scope.siteIds.length>1000)throw Error("Authorized Site options exceed the bounded report scope");
  if(!scope.siteIds.length)return [];
  const rows=await reader.select({id:sites.id,label:sites.name}).from(sites)
    .where(ownedSites(scope)).orderBy(asc(sites.name),asc(sites.id)).limit(1001);
  if(rows.length>1000)throw Error("Authorized Site options exceed the bounded report scope");
  return rows;
}
/** Independently confirm the exact selected Site still belongs to the
 * verified provider, even if a stale authorization list contains its ID. */
export async function requireSelectedProviderReportSite(reader:Reader,scope:ProviderSiteScope,requestedSite:string|undefined){
  const selected=authorizedReportSite(requestedSite,scope.siteIds);
  if(!selected)return null;
  const [row]=await reader.select({id:sites.id}).from(sites)
    .where(and(eq(sites.id,selected),eq(sites.organizationId,scope.organizationId))).limit(1);
  if(!row)throw Error("Selected Site is unavailable in the authorized report scope");
  return row.id;
}
