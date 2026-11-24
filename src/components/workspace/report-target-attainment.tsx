import {DashboardProgress} from "./dashboard-widgets";
import {formatReportValue,reportTargetAttainment,type ReportValueFormat} from "@/domain/report-value-format";
/** Actual attainment can exceed 100%; only the visual bar is capped. */
export function ReportTargetAttainment({label,value,target,format="count",description}:{label:string;value:number|null;target:number;format?:ReportValueFormat;description?:string}){
  const result=reportTargetAttainment(value,target,format);
  const detail=result?new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(result.percent)+"% of target achieved": "Target attainment unavailable";
  return <div className="min-w-0 border border-border bg-card p-4">
    <DashboardProgress label={label} value={result?.visualValue??NaN} max={target} appearance="analytical"
      description={result?detail+(result.percent>100?" (bar capped at 100%)":""):detail}/>
    <p className="mt-2 text-xs text-muted-foreground">{formatReportValue(value,format)} recorded · {formatReportValue(target,format)} target</p>
    {description&&<p className="mt-1 text-xs text-muted-foreground">{description}</p>}
  </div>;
}
