/** Presentation units. Values stay in source units; percentages are 0..100,
 * USD is explicitly dollars (not cents), and time units never auto-convert. */
export type ReportValueFormat="count"|"decimal"|"percent"|"usd"|"hours"|"minutes"|"ratio";
export function isReportValue(value:unknown,format:ReportValueFormat="count"):value is number{
  return typeof value==="number"&&Number.isFinite(value)&&value>=0&&
    (format!=="count"||Number.isSafeInteger(value))&&(format!=="percent"||value<=100);
}
function decorate(value:string,format:ReportValueFormat){
  switch(format){
    case "usd":return "$"+value;
    case "percent":return value+"%";
    case "hours":return value+" h";
    case "minutes":return value+" min";
    case "ratio":return value+":1";
    default:return value;
  }
}
export function formatReportValue(value:number|null|undefined,format:ReportValueFormat="count"){
  if(!isReportValue(value,format))return "Unavailable";
  const options:Intl.NumberFormatOptions=format==="usd"?{style:"currency",currency:"USD"}:
    {maximumFractionDigits:format==="count"?0:2};
  const text=new Intl.NumberFormat("en-US",options).format(value);
  return format==="usd"?text:decorate(text,format);
}
export function formatReportAxis(value:number,format:ReportValueFormat="count"){
  if(!Number.isFinite(value)||value<0)return "";
  if(format==="percent"||value<1000){
    // Numeric axes can generate fractional ticks even for counts.
    return decorate(new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(value),format);
  }
  return decorate(new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(value),format);
}
export function reportValueComparison(current:number|null|undefined,prior:number|null|undefined,format:ReportValueFormat="count"){
  if(!isReportValue(current,format)||!isReportValue(prior,format))return null;
  const change=current-prior;
  const relative=prior===0?null:change/prior*100;
  return {current,prior,change,relativePercent:relative!==null&&Number.isFinite(relative)?relative:null};
}
export function formatReportChange(change:number,format:ReportValueFormat="count"){
  if(!Number.isFinite(change))return "Unavailable";
  const sign=change>0?"+":change<0?"−":"";
  const magnitude=Math.abs(change);
  return sign+(format==="percent"?new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(magnitude)+" pp":formatReportValue(magnitude,format));
}
export function reportTargetAttainment(value:number|null,target:number,format:ReportValueFormat="count"){
  if(!isReportValue(value,format)||!isReportValue(target,format)||target===0)return null;
  const percent=value/target*100;
  return Number.isFinite(percent)?{percent,visualValue:Math.min(value,target)}:null;
}
