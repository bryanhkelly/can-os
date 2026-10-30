import { siteDate } from "@/domain/expected-attendance";

function minutes(value:string|null):number|null{
  const match=/^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value??"");
  if(!match)return null;
  const h=Number(match[1]),m=Number(match[2]);
  return h<24&&m<60?h*60+m:null;
}

/** Arrival reporting opens at most 60 min before a school-local block and
 * closes at the scheduled end. Invalid, overnight and prior/future dates
 * cannot be used to backfill physical presence or fake a future check-in.
 */
export function inPhysicalCheckInWindow(input:{
  now:Date;date:string;timezone:string;
  start:string|null;end:string|null;
}):boolean{
  const start=minutes(input.start),end=minutes(input.end);
  if(start===null||end===null||end<=start||
     !Number.isFinite(input.now.getTime()) ||
     siteDate(input.now,input.timezone)!==input.date)return false;
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:input.timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  }).formatToParts(input.now);
  const fields=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const current=Number(fields.hour)*60+Number(fields.minute);
  return Number.isFinite(current)&&current>=start-60&&current<end;
}
