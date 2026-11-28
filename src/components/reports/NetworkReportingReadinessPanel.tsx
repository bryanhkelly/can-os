import {Button} from "@/components/ui/button";
import {WorkspacePanel,WorkspaceNotice,QueryState} from "@/components/workspace";
import {ReportDocumentView,type ReportDocument} from "@/components/workspace/report-document";
import {usePrivateReportQuery,usePrivateReportScope} from "@/hooks/use-private-report-query";
import {reportDefinitionId} from "@/domain/report-catalog";
import {getNetworkReportingReadiness} from "@/modules/insights/network-reporting-readiness.functions";
function Readiness({scope}:{scope:string}){
  const {query,data}=usePrivateReportQuery({scope,key:["network-reporting-readiness"],read:()=>getNetworkReportingReadiness()});
  const report:ReportDocument|null=data?{
    version:1,definitionId:reportDefinitionId("network-reporting-readiness"),title:"Reporting relationships",
    scopeLabel:"Current denomination HQ only",basis:"Checked "+data.asOf+"; counts are configuration records, not verified permissions or outcomes",
    blocks:[{id:"inventory",kind:"metrics",items:[
      {id:"units",label:"Current reporting units",value:data.counts.activeUnits,hint:"Districts, jurisdictions or other network-defined units"},
      {id:"memberships",label:"Current approved membership records",value:data.counts.currentMemberships,hint:"Not verified individual affiliation"},
      {id:"grants",label:"Current grant records",value:data.counts.currentGrants,hint:"Evidence and metric eligibility not certified"},
      {id:"hosts",label:"Hosts with current grant records",value:data.counts.currentGrantHosts,hint:"Not an execution authorization"},
    ]}],
  }:null;
  return <div className="space-y-4">
    <QueryState loading={query.isFetching||query.isPending?"Checking network reporting setup…":undefined}
      error={query.isError?"Reporting setup is unavailable. A current independently verified HQ account and agreement are required.":undefined}
      onRetry={()=>void query.refetch()}>
      {report&&data&&<>
        <ReportDocumentView report={report}/>
        <WorkspaceNotice>These measures describe the reporting relationships currently recorded for your organization. They are not learner outcomes. A shared outcome must have its own verified reporting scope and source evidence.</WorkspaceNotice>
        {data.blockers.length>0&&<ul className="list-disc pl-5 space-y-1 text-sm">{data.blockers.map(blocker=><li key={blocker}>{blocker}</li>)}</ul>}
        <Button type="button" size="sm" variant="outline" disabled={query.isFetching} onClick={()=>void query.refetch()}>Refresh setup inventory</Button>
      </>}
    </QueryState>
  </div>;
}
export function NetworkReportingReadinessPanel(){
  const scope=usePrivateReportScope();
  if(!scope)return null;
  return <WorkspacePanel title="National and jurisdictional reporting"
    description="Current reporting units, memberships and host grant records for your organization."
    className="mt-8" id="network-reporting">
    <Readiness key={scope} scope={scope}/>
  </WorkspacePanel>;
}
