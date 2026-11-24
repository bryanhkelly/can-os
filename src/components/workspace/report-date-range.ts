export type ReportDateRange={fromDay:string;untilDay:string};
const dayMs=86400000;
function utcDay(value:string):number|null{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const time=Date.parse(value+"T00:00:00.000Z");
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
}
/** Exclusive end, complete UTC days only, matching server cohort boundaries. */
export function resolveReportDateRange(range:ReportDateRange,maxDays:number,now:Date){
  const from=utcDay(range.fromDay),to=utcDay(range.untilDay);
  if(!Number.isSafeInteger(maxDays)||maxDays<1||from===null||to===null||to<=from||
    to-from>maxDays*dayMs||!Number.isFinite(now.getTime())||to>now.getTime())return null;
  return {from:new Date(from).toISOString(),to:new Date(to).toISOString()};
}
export function previousCompleteUtcDays(days:number,now:Date):ReportDateRange{
  const untilDay=now.toISOString().slice(0,10);
  return {untilDay,fromDay:new Date(Date.parse(untilDay+"T00:00:00.000Z")-days*dayMs).toISOString().slice(0,10)};
}

/** Equal-duration preceding complete UTC window. No overlap or invented historical state. */
export function priorReportDateRange(range:ReportDateRange,maxDays:number,now:Date):ReportDateRange|null{
  const period=resolveReportDateRange(range,maxDays,now);
  if(!period)return null;
  const from=Date.parse(period.from),to=Date.parse(period.to);
  return {fromDay:new Date(from-(to-from)).toISOString().slice(0,10),untilDay:range.fromDay};
}
