import {sql,type SQL} from "drizzle-orm";
import type {db} from "@/db/client";
import {reportingGeographyKinds,type GeographyFilterOption} from "@/domain/geographic-reporting";
type Reader=Pick<typeof db,"execute">;
/** Only compose with independently authorized facts. Never use geography to establish access.
 * The time is the source fact's timestamp, or an explicitly labelled current-Site snapshot. */
export function geographyFactPredicate(selection:string,site:SQL,organization:SQL,at:SQL):SQL{
 if(!selection)return sql`TRUE`;
 const version=sql`g.site_id=${site} AND g.organization_id=${organization}
   AND g.resolved_at<=${at} AND (g.superseded_at IS NULL OR g.superseded_at>${at})`;
 if(selection==="market:unknown")return sql`NOT EXISTS(SELECT 1 FROM public.site_geography_versions g WHERE ${version} AND g.market_status IN ('metro','micro','outside_market'))`;
 if(selection==="market:outside")return sql`EXISTS(SELECT 1 FROM public.site_geography_versions g WHERE ${version} AND g.market_status='outside_market')`;
 return sql`EXISTS(SELECT 1 FROM public.site_geography_versions g
   JOIN public.site_geographic_memberships m ON m.site_geography_version_id=g.id
   JOIN public.geographic_area_versions v ON v.id=m.area_version_id
   JOIN public.geographic_areas a ON a.id=v.area_id WHERE ${version} AND a.code=${selection})`;
}
export async function listScopedGeographyOptions(reader:Reader,scope:{organizationId:string;siteIds:readonly string[]},basis:"current"|"historical",asOf:Date){
 if(!scope.siteIds.length)return [];
 const ids=sql.join(scope.siteIds.map(id=>sql`${id}::uuid`),sql`,`);
 const kinds=sql.join(reportingGeographyKinds.map(kind=>sql`${kind}`),sql`,`);
 const result=await reader.execute(sql`SELECT DISTINCT ON(a.code) a.code,v.name,v.kind FROM public.site_geography_versions g
 JOIN public.sites s ON s.id=g.site_id AND s.organization_id=g.organization_id
 JOIN public.site_geographic_memberships m ON m.site_geography_version_id=g.id
 JOIN public.geographic_area_versions v ON v.id=m.area_version_id
 JOIN public.geographic_areas a ON a.id=v.area_id
 WHERE g.organization_id=${scope.organizationId} AND g.site_id IN (${ids}) AND g.resolved_at<=${asOf}
 AND ${basis==="current"?sql`(g.superseded_at IS NULL OR g.superseded_at>${asOf})`:sql`TRUE`}
 AND v.kind IN (${kinds}) ORDER BY a.code,g.resolved_at DESC LIMIT 1001`);
 if(result.rows.length>1000)throw new Error("Geographic options exceed the bounded report scope");
 return (result.rows as unknown as GeographyFilterOption[]).sort((a,b)=>a.name.localeCompare(b.name)||a.code.localeCompare(b.code));
}
