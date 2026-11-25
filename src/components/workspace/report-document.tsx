import { useId } from "react";
import { WorkspaceNotice } from "./notice";
import {ReportMetricCard,matchReportMetricDefinition,type ReportMetricItem} from "./report-metric-card";
import {ReportTargetAttainment} from "./report-target-attainment";
import type {ReportValueFormat} from "@/domain/report-value-format";
import { ReportChart,type ReportPresentation } from "./report-chart";
import { type ReportChartSpec } from "./report-chart-data";
import {ReportMetricDefinitions} from "./report-metric-definitions";
import type { SourceMetricContract } from "@/domain/reporting-metric-registry";

export type ReportBlock =
  | {id:string;kind:"metrics";items:readonly ReportMetricItem[]}
  | {id:string;kind:"chart";spec:ReportChartSpec;metricRefs?:readonly Pick<ReportMetricItem,"id"|"definitionVersion">[]}
  | {id:string;kind:"progress";label:string;value:number|null;target:number;description:string;format?:ReportValueFormat}
  | {id:string;kind:"note";text:string};
export type ReportDocument = {
  version:1;definitionId:string;title:string;scopeLabel:string;basis:string;blocks:readonly ReportBlock[];
  definitions?:readonly SourceMetricContract[];asOf?:string;
};
/** A versioned read-only view model, not a query language or disclosure grant. */
export function ReportDocumentView({report,presentation="interactive"}:{report:ReportDocument;presentation?:ReportPresentation}){
  const titleId=useId();
  if(report.version!==1||new Set(report.blocks.map(b=>b.id)).size!==report.blocks.length)
    return <WorkspaceNotice tone="danger">Unsupported or invalid report definition.</WorkspaceNotice>;
  return <section data-report-document={report.definitionId} aria-labelledby={titleId} className="min-w-0 space-y-4 print:text-sm">
    <div><h3 id={titleId} className="font-serif text-section font-normal leading-tight [overflow-wrap:anywhere]">{report.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{report.scopeLabel}. {report.basis}</p>
      {report.asOf&&<p className="mt-1 text-xs text-muted-foreground">Evidence as of {report.asOf}</p>}</div>
    {report.blocks.map(block=>{
      switch(block.kind){
        case "metrics":return <div key={block.id} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {block.items.map(item=><ReportMetricCard key={item.id} item={{...item,asOf:item.asOf??report.asOf}} definition={matchReportMetricDefinition(item,report.definitions)} print={presentation==="print"}/>)}
        </div>;
        case "chart":{
          const refs=block.metricRefs??(block.spec.kind==="stacked"?block.spec.series:block.spec.points);
          const definitions=[...new Map(refs.flatMap(ref=>{
            const def=matchReportMetricDefinition(ref,report.definitions);
            return def?[[def.metricKey+":"+def.definitionVersion,def] as const]:[];
          })).values()];
          return <ReportChart key={block.id} spec={block.spec} presentation={presentation} headingLevel="h4"
            definitions={definitions} asOf={report.asOf}/>;
        }
        case "progress":return <ReportTargetAttainment key={block.id} label={block.label} value={block.value} target={block.target} format={block.format} description={block.description}/>;
        case "note":return <p key={block.id} className="text-sm text-muted-foreground">{block.text}</p>;
      }
    })}
    <ReportMetricDefinitions title={report.title} definitions={report.definitions??[]} expanded={presentation==="print"}/>
  </section>;
}
