import {useId} from "react";
import {reportSeriesColors,reportSeriesPatterns,reportPlotStyle} from "./report-chart-palette";

/** SVG paint IDs must be unique across charts and legends in the application root. */
export function useReportPaintPrefix(){
  const id=useId();
  return "report-paint-"+Array.from(id,c=>c.codePointAt(0)!.toString(16)).join("-");
}
export function reportSeriesPaint(prefix:string,index:number){
  return index===0?reportSeriesColors[0]:`url(#${prefix}-${index}) ${reportSeriesColors[index]}`;
}
export function ReportPatternDefinition({prefix,index}:{prefix:string;index:number}){
  const pattern=reportSeriesPatterns[index];
  const color=reportSeriesColors[index];
  if(!pattern||!color||pattern==="solid")return null;
  return <pattern id={prefix+"-"+index} width="8" height="8" patternUnits="userSpaceOnUse">
    <rect width="8" height="8" fill={color}/>
    {pattern==="diagonal"&&<path d="M-2 2L2 -2M0 8L8 0M6 10L10 6" fill="none" stroke={reportPlotStyle.separator} strokeWidth="1.25"/>}
    {pattern==="dots"&&<circle cx="4" cy="4" r="1.4" fill={reportPlotStyle.separator}/>}
    {pattern==="crosshatch"&&<path d="M0 4H8M4 0V8" fill="none" stroke={reportPlotStyle.separator} strokeWidth="1"/>}
  </pattern>;
}
export function ReportSeriesMark({index}:{index:number}){
  const prefix=useReportPaintPrefix();
  return <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" className="shrink-0 print:hidden">
    <defs><ReportPatternDefinition prefix={prefix} index={index}/></defs>
    <rect x=".5" y=".5" width="15" height="15" fill={reportSeriesPaint(prefix,index)} stroke={reportPlotStyle.separator}/>
  </svg>;
}
export function ReportSeriesLegend({items}:{items:readonly {id:string;label:string;slot?:number}[]}){
  return <ul aria-label="Chart series" className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-sans text-foreground print:hidden">
    {items.map((item,index)=><li key={item.id} className="flex min-w-0 items-start gap-2">
      <ReportSeriesMark index={item.slot??index}/><span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.label}</span>
    </li>)}
  </ul>;
}
