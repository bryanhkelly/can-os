import {formatReportChartValue,type ReportChartSpec} from "./report-chart-data";
/** Read-only supplementary pointer information. Exact values are always
 * available without hover, focus, touch or the SVG. Never an action surface. */
export function ReportChartTooltip({title,items,format}:{title:string;items:readonly {label:string;value:number|null}[];format:ReportChartSpec["format"]}){
  if(!items.length)return null;
  return <div className="max-w-64 break-words border border-border bg-popover p-3 font-sans text-xs text-popover-foreground shadow-sm">
    <p className="font-semibold">{title}</p>
    <dl className="mt-2 space-y-1">
      {items.map((item,i)=><div key={i} className="flex items-start justify-between gap-4">
        <dt>{item.label}</dt><dd className="shrink-0 font-semibold tabular-nums">{formatReportChartValue(item.value,format)}</dd>
      </div>)}
    </dl>
  </div>;
}
