import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useWorkspaceSession,workspaceSessionIdentity} from "@/components/shell/WorkspaceSession";
import {Button} from "@/components/ui/button";
import {QueryState} from "@/components/workspace/query-state";
import {ReportDocumentView,type ReportDocument} from "@/components/workspace/report-document";
import {ReportDateFilter} from "@/components/workspace/report-date-filter";
import {previousCompleteUtcDays,resolveReportDateRange} from "@/components/workspace/report-date-range";
import {campaignReportDefinitions,campaignReportKeys} from "@/domain/reporting-view-definitions";
import {getSiteCampaignDeliveryMetrics} from "@/modules/operations/site-reporting-coverage.functions";

function CampaignReport({siteId,scope}:{siteId:string;scope:string}){
  const [range,setRange]=useState(()=>previousCompleteUtcDays(30,new Date()));
  const period=resolveReportDateRange(range,90,new Date());
  const query=useQuery({
    queryKey:["site-campaign-delivery-evidence",scope,siteId,period?.from,period?.to],
    enabled:period!==null,queryFn:()=>getSiteCampaignDeliveryMetrics({data:{siteId,...period!}}),
    retry:false,staleTime:0,gcTime:0,
  });
  const data=!query.isError&&!query.isFetching?query.data:undefined;
  const definitions=campaignReportDefinitions();
  const items=definitions.map((d,i)=>({id:d.metricKey,label:d.label,value:data?.counts[campaignReportKeys[i]!]??null}));
  const report:ReportDocument|null=data?{version:1,definitionId:"site-campaign-delivery-v1",title:"Site email delivery evidence",
    scopeLabel:"Current authorized Site, across its Site- and Program-owned campaigns",
    basis:"Campaigns created "+data.from+" through "+data.to+" (exclusive); current state checked "+data.asOf,
    definitions,blocks:[
      {id:"metrics",kind:"metrics",items},
      {id:"outcomes",kind:"chart",spec:{title:"Delivery evidence",description:"Current counts may overlap, especially provider acceptance. Do not sum the bars or interpret them as a conversion funnel.",valueLabel:"Delivery rows",kind:"comparison",format:"count",points:items.filter(i=>i.id!=="campaign.total")}},
      {id:"scope",kind:"note",text:"Organization-owned campaigns are excluded. Delivery rows are not unique people, opens, human reach, or attributable conversions."},
    ]}:null;
  return <div className="space-y-4">
    <ReportDateFilter initial={range} maxDays={90} onApply={next=>{if(next.fromDay===range.fromDay&&next.untilDay===range.untilDay)void query.refetch();else setRange(next);}} disabled={query.isFetching}/>
    <Button type="button" variant="outline" size="sm" disabled={query.isFetching} onClick={()=>void query.refetch()}>Refresh delivery evidence</Button>
    <QueryState loading={query.isFetching||query.isPending?"Loading authorized campaign evidence…":undefined}
      error={query.isError?"Site-wide delivery evidence is unavailable. A current whole-Site reporting grant is required.":undefined}
      onRetry={()=>void query.refetch()}>
      {report&&<ReportDocumentView report={report}/>}
    </QueryState>
  </div>;
}
/** Whole-Site scope is explicit and independently verified on each server read. */
export function SiteCampaignEvidencePanel({siteId}:{siteId:string}){
  const session=useWorkspaceSession();
  const scope=session.session?.authenticated&&!session.error?workspaceSessionIdentity(session):null;
  const [open,setOpen]=useState(false);
  if(!scope)return null;
  return <section className="mt-5 space-y-3 border border-border bg-card p-4" aria-label="Site-wide email delivery">
    <Button type="button" variant="outline" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?"Close Site-wide email report":"View Site-wide email report"}</Button>
    {open&&<CampaignReport key={scope+":"+siteId} scope={scope} siteId={siteId}/>}
  </section>;
}
