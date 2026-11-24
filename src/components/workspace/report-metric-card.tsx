import {StatCard} from "./stat-card";
import {formatReportValue,formatReportChange,reportValueComparison,type ReportValueFormat} from "@/domain/report-value-format";
import type {SourceMetricContract} from "@/domain/reporting-metric-registry";

export type ReportMetricItem={id:string;label:string;value:number|null;prior?:number|null;hint?:string;
  format?:ReportValueFormat;asOf?:string;definitionVersion?:string};
/** Exact definition version only; an ambiguous or absent key is never guessed. */
export function matchReportMetricDefinition(item:Pick<ReportMetricItem,"id"|"definitionVersion">,definitions:readonly SourceMetricContract[]=[]){
  const matches=definitions.filter(def=>def.metricKey===item.id&&(!item.definitionVersion||def.definitionVersion===item.definitionVersion));
  return matches.length===1?matches[0]:undefined;
}
export function ReportMetricDefinition({definition,expanded=false}:{definition:SourceMetricContract;expanded?:boolean}){
  return <details open={expanded?true:undefined} className="border-x border-b border-border bg-card p-3 text-xs text-muted-foreground">
    <summary className="cursor-pointer font-medium text-foreground">Definition and source<span className="sr-only"> for {definition.label}</span></summary>
    <dl className="mt-2 space-y-2">
      <div><dt className="font-medium text-foreground">Version</dt><dd>{definition.metricKey} · v{definition.definitionVersion}</dd></div>
      <div><dt className="font-medium text-foreground">Source</dt><dd className="break-words [overflow-wrap:anywhere]">{definition.source}</dd></div>
      <div><dt className="font-medium text-foreground">Population</dt><dd>{definition.denominator}</dd></div>
      <div><dt className="font-medium text-foreground">Counting rule</dt><dd>{definition.rule}</dd></div>
      <div><dt className="font-medium text-foreground">Time basis</dt><dd>{definition.timeBasis}</dd></div>
    </dl>
  </details>;
}
/** Composes StatCard; no new visual primitive or source query. Change is
 * descriptive, never automatically good/bad. Freshness must come from reader. */
export function ReportMetricCard({item,compare=false,definition,print=false}:{item:ReportMetricItem;compare?:boolean;definition?:SourceMetricContract;print?:boolean}){
  const comparison=compare?reportValueComparison(item.value,item.prior,item.format):null;
  return <div className="min-w-0">
    <StatCard label={item.label} value={formatReportValue(item.value,item.format)} className="min-w-0 [overflow-wrap:anywhere]"
      hint={<>{item.hint}{compare&&<span className="mt-1 block">
        {comparison?"Prior "+formatReportValue(comparison.prior,item.format)+" · Change "+formatReportChange(comparison.change,item.format):"Prior comparison unavailable"}
      </span>}{compare&&comparison&&comparison.relativePercent!==null&&item.format!=="percent"&&
        <span className="mt-1 block">{formatReportChange(comparison.relativePercent,"decimal")}% relative change</span>}
      {compare&&comparison&&comparison.prior===0&&<span className="mt-1 block">Relative change unavailable (zero baseline)</span>}
      {item.asOf&&<span className="mt-1 block">Evidence as of {item.asOf}</span>}</>}/>
    {definition&&<ReportMetricDefinition definition={definition} expanded={print}/>}
  </div>;
}
