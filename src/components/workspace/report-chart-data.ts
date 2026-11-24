/** Presentation-only contract. Source readers own all counting and authorization. */
export type ReportChartPoint = { id: string; label: string; value: number | null };
type ChartFormat = "count" | "decimal" | "percent";
type ChartBase = { title: string; description: string; valueLabel: string; format?: ChartFormat };
export type ReportSingleChartSpec = ChartBase & (
  | {kind: "comparison" | "trend"; points: readonly ReportChartPoint[]}
  | {kind: "distribution"; points: readonly ReportChartPoint[]; total: number; population: string}
  | {kind: "funnel"; points: readonly ReportChartPoint[]; population: string; nestedCohort: true}
);
export type ReportStackedChartSpec = ChartBase & {
  kind: "stacked"; population: string;
  series: readonly {id: string; label: string}[];
  rows: readonly {id: string; label: string; total: number; values: readonly number[]}[];
};
export type ReportChartSpec = ReportSingleChartSpec | ReportStackedChartSpec;

function validValue(value: number, format: ChartFormat = "count") {
  return Number.isFinite(value) && value >= 0 &&
    (format !== "count" || Number.isSafeInteger(value)) && (format !== "percent" || value <= 100);
}
function uniqueLabels(items: readonly {id:string;label:string}[], maximum: number) {
  return items.length <= maximum && new Set(items.map(item=>item.id)).size===items.length &&
    items.every(item=>!!item.id.trim()&&!!item.label.trim());
}
function reconciles(values: readonly number[], total:number, format:ChartFormat="count") {
  const sum=values.reduce((a,b)=>a+b,0);
  return validValue(total,format)&&values.every(v=>validValue(v,format))&&
    (format==="count"?sum===total:Math.abs(sum-total)<1e-8*Math.max(1,total));
}
export function validateReportChart(spec: ReportChartSpec): boolean {
  if (!spec.title.trim() || !spec.description.trim() || !spec.valueLabel.trim()) return false;
  if(spec.kind==="stacked"){
    return !!spec.population.trim()&&spec.series.length>=2&&uniqueLabels(spec.series,4)&&uniqueLabels(spec.rows,30)&&
      spec.rows.every(row=>row.values.length===spec.series.length&&reconciles(row.values,row.total,spec.format));
  }
  if(!uniqueLabels(spec.points,60)||!spec.points.every(p=>p.value===null||validValue(p.value,spec.format)))return false;
  if(spec.kind==="distribution"){
    return !!spec.population.trim()&&spec.points.length<=4&&spec.points.every(p=>p.value!==null)&&
      reconciles(spec.points.map(p=>p.value!),spec.total,spec.format);
  }
  if(spec.kind==="funnel"){
    return !!spec.population.trim()&&spec.nestedCohort===true&&spec.points.length>=2&&
      spec.points.every((p,i)=>p.value!==null&&(i===0||p.value<=spec.points[i-1]!.value!));
  }
  return true;
}
export function hasReportChartValues(spec:ReportChartSpec):boolean {
  return spec.kind==="stacked"?spec.rows.length>0:spec.points.some(p=>p.value!==null);
}
export function formatReportChartValue(value: number | null, format: ChartFormat = "count"): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {maximumFractionDigits: format === "count" ? 0 : 2}).format(value) +
    (format === "percent" ? "%" : "");
}
