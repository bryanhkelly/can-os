import {WorkspaceNotice} from "@/components/workspace/notice";
import {ReportDocumentView,type ReportDocument} from "@/components/workspace/report-document";
import {reportDefinitionId} from "@/domain/report-catalog";
import type {getNetworkReportingReadiness} from "@/modules/insights/network-reporting-readiness.functions";
export type NetworkReportingReadinessData=Awaited<ReturnType<typeof getNetworkReportingReadiness>>;
/** Source-provided setup inventory, not evidence of national outcomes. */
export function NetworkReportingReadinessView({data}:{data:NetworkReportingReadinessData}){
  const report:ReportDocument={
    version:1,definitionId:reportDefinitionId("network-reporting-readiness"),title:"Reporting setup inventory",
    scopeLabel:"Current denomination HQ only",basis:"Checked "+data.asOf+"; counts are configuration records, not verified permissions or outcomes",
    blocks:[{id:"inventory",kind:"metrics",items:[
      {id:"units",label:"Current reporting units",value:data.counts.activeUnits,hint:"Districts, jurisdictions or other network-defined units"},
      {id:"memberships",label:"Current approved membership records",value:data.counts.currentMemberships,hint:"Not verified individual affiliation"},
      {id:"grants",label:"Current grant records",value:data.counts.currentGrants,hint:"Evidence and metric eligibility not certified"},
      {id:"hosts",label:"Hosts with current grant records",value:data.counts.currentGrantHosts,hint:"Not an execution authorization"},
    ]}],
  };
  return <div className="space-y-4">
    <ReportDocumentView report={report}/>
    <WorkspaceNotice tone="attention">Cross-provider outcome reporting is not enabled. No national or jurisdictional learner totals are returned.</WorkspaceNotice>
    <ul className="list-disc pl-5 space-y-1 text-sm">{data.blockers.map(blocker=><li key={blocker}>{blocker}</li>)}</ul>
  </div>;
}
