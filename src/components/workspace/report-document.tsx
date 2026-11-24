import { useId } from "react";
import { StatCard } from "./stat-card";
import { DashboardProgress } from "./dashboard-widgets";
import { ReportChart,type ReportPresentation } from "./report-chart";
import { formatReportChartValue, type ReportChartSpec } from "./report-chart-data";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import type { SourceMetricContract } from "@/domain/reporting-metric-registry";

export type ReportBlock =
  | {id:string;kind:"metrics";items:readonly {id:string;label:string;value:number|null;hint?:string}[]}
  | {id:string;kind:"chart";spec:ReportChartSpec}
  | {id:string;kind:"progress";label:string;value:number|null;target:number;description:string}
  | {id:string;kind:"note";text:string};
export type ReportDocument = {
  version:1;definitionId:string;title:string;scopeLabel:string;basis:string;blocks:readonly ReportBlock[];
  definitions?:readonly SourceMetricContract[];
};
/** A versioned read-only view model, not a query language or disclosure grant. */
export function ReportDocumentView({report,presentation="interactive"}:{report:ReportDocument;presentation?:ReportPresentation}){
  const titleId=useId();
  if(report.version!==1||new Set(report.blocks.map(b=>b.id)).size!==report.blocks.length)
    return <p role="alert">Unsupported or invalid report definition.</p>;
  return <section aria-labelledby={titleId} className="min-w-0 space-y-4 print:text-sm">
    <div><h3 id={titleId} className="font-serif text-section font-normal leading-tight">{report.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{report.scopeLabel}. {report.basis}</p></div>
    {report.blocks.map(block=>{
      switch(block.kind){
        case "metrics":return <div key={block.id} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {block.items.map(item=><StatCard key={item.id} label={item.label} hint={item.hint}
            value={formatReportChartValue(item.value!==null&&Number.isSafeInteger(item.value)&&item.value>=0?item.value:null)}/>)}
        </div>;
        case "chart":return <ReportChart key={block.id} spec={block.spec} presentation={presentation} headingLevel="h4"/>;
        case "progress":return <div key={block.id} className="border border-border bg-card p-4"><DashboardProgress label={block.label}
          value={block.value??NaN} max={block.target} description={block.description}/></div>;
        case "note":return <p key={block.id} className="text-sm text-muted-foreground">{block.text}</p>;
      }
    })}
    {!!report.definitions?.length&&<details className="border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold text-sm">Metric definitions and evidence sources</summary>
      <Table scrollLabel={report.title+" metric definitions"} aria-label={report.title+" metric definitions"}>
        <TableCaption className="sr-only">Metric definitions and versions</TableCaption>
        <TableHeader><TableRow><TableHead scope="col">Metric</TableHead><TableHead scope="col">Source and version</TableHead><TableHead scope="col">Counting rule</TableHead></TableRow></TableHeader>
        <TableBody>{report.definitions.map(d=><TableRow key={d.metricKey+":"+d.definitionVersion}>
          <TableRowHead>{d.label}</TableRowHead><TableCell className="break-words">{d.source} · v{d.definitionVersion}</TableCell>
          <TableCell>{d.denominator}. {d.rule} {d.timeBasis}.</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </details>}
  </section>;
}
