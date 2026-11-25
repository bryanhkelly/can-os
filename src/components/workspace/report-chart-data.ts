/** Presentation-only contract. Source readers own all counting and authorization. */
export type ReportChartPoint = { id: string; label: string; value: number | null };
import {isReportValue,formatReportValue,formatReportAxis,type ReportValueFormat} from "@/domain/report-value-format";
export type ChartFormat=ReportValueFormat;
type ChartBase = { title: string; description: string; valueLabel: string; format?: ChartFormat; axisMax?:number; seriesOrder?:readonly string[] };
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

const validValue=isReportValue;
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
  if(!validReportChartPresentation(spec))return false;
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
export const formatReportChartValue=formatReportValue;
export const formatReportAxisValue=formatReportAxis;
export function truncateReportLabel(label:string,maxChars:number){
  const chars=Array.from(label);
  return chars.length<=maxChars?label:chars.slice(0,Math.max(1,maxChars-1)).join("")+"…";
}
/** Plot responds to its measured container, not the browser viewport. */
export function reportChartLayout(containerWidth:number){
  const width=Number.isFinite(containerWidth)&&containerWidth>0?containerWidth:320;
  const categoryWidth=Math.max(64,Math.min(180,Math.floor(width*0.36)));
  return {
    categoryWidth,categoryLabelChars:Math.max(6,Math.floor((categoryWidth-12)/7)),
    trendLabelChars:Math.max(6,Math.min(20,Math.floor(width/5/7))),
    numberWidth:width<400?54:72,tickCount:width<340?3:width<550?4:6,
  };
}
export function hasNonzeroReportChartValues(spec:ReportChartSpec){
  return spec.kind==="stacked"?spec.rows.some(row=>row.total>0):spec.points.some(point=>point.value!==null&&point.value>0);
}

/** Stable category family order is source-owned, not derived from a filtered
 * result. Reserved slots may be absent; they must not be reassigned. */
export function reportSeriesSlot(spec:ReportChartSpec,id:string,index:number){
  return spec.seriesOrder?spec.seriesOrder.indexOf(id):index;
}
function validReportChartPresentation(spec:ReportChartSpec){
  const categories=spec.kind==="stacked"?spec.series:spec.kind==="distribution"?spec.points:null;
  if(spec.seriesOrder){
    if(!categories||spec.seriesOrder.length>4||new Set(spec.seriesOrder).size!==spec.seriesOrder.length||
      spec.seriesOrder.some(id=>!id.trim())||categories.some(item=>!spec.seriesOrder!.includes(item.id)))return false;
  }
  if(spec.axisMax===undefined)return true;
  if(spec.kind==="distribution"||!validValue(spec.axisMax,spec.format)||spec.axisMax<=0||
    (spec.format==="percent"&&spec.axisMax!==100))return false;
  const values=spec.kind==="stacked"?spec.rows.map(r=>r.total):spec.points.map(p=>p.value);
  return values.every(value=>value===null||value<=spec.axisMax!);
}
export function reportChartDomain(spec:ReportChartSpec):[number,number|"auto"]{
  return [0,spec.format==="percent"?100:spec.axisMax??"auto"];
}
