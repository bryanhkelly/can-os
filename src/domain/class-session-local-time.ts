/**
 * Class Session scheduling uses the hosting Site's IANA time zone, never
 * the facilitator's browser time zone. The browser supplies a wall-clock
 * datetime-local value; we reject nonexistent or ambiguous DST times rather
 * than silently moving the meeting by an hour.
 *
 * No browser APIs, external services or third-party timezone libraries.
 */
export type SiteMeeting = {
  requestId:string;
  startsAt:string;
  endsAt:string;
};
export type LocalMeeting = {
  requestId:string;
  localStart:string;
  durationMinutes:number;
};

const localPattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
function utcParts(instant:number,timeZone:string){
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone,year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",
  }).formatToParts(instant);
  const get=(type:string)=>Number(parts.find(part=>part.type===type)?.value);
  return {year:get("year"),month:get("month"),day:get("day"),
    hour:get("hour"),minute:get("minute"),second:get("second")};
}
function asUtc(parts:ReturnType<typeof utcParts>):number {
  return Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
}
export function validateSiteTimeZone(timeZone:string):string{
  if(!timeZone||timeZone.length>100)throw new Error("A hosting Site time zone is required.");
  try{new Intl.DateTimeFormat("en-US",{timeZone}).format(0);}
  catch{throw new Error("The hosting Site has an invalid IANA time zone.");}
  return timeZone;
}
export function localClassTimeToInstant(local:string,timeZone:string):Date{
  validateSiteTimeZone(timeZone);
  if(!localPattern.test(local))throw new Error("Select a complete local date and time.");
  const [datePart,timePart]=local.split("T");
  const [year,month,day]=datePart!.split("-").map(Number);
  const [hour,minute]=timePart!.split(":").map(Number);
  const wallMillis=Date.UTC(year,month-1,day,hour,minute,0);
  if(!Number.isFinite(wallMillis)||new Date(wallMillis).toISOString().slice(0,16)!==local)
    throw new Error("Select a real calendar date and time.");
  const offsets=new Set<number>();
  for(const time of [wallMillis-86400000,wallMillis,wallMillis+86400000]){
    offsets.add(asUtc(utcParts(time,timeZone))-time);
  }
  const matches=[...offsets].map(offset=>wallMillis-offset).filter(time=>{
    const p=utcParts(time,timeZone);
    return p.year===year&&p.month===month&&p.day===day&&
      p.hour===hour&&p.minute===minute;
  });
  if(matches.length!==1){
    throw new Error("That local time is missing or ambiguous because of a daylight-saving change. Choose another time.");
  }
  return new Date(matches[0]!);
}
export function siteWallWeek(firstLocal:string,index:number):string{
  if(!localPattern.test(firstLocal)||!Number.isInteger(index)||index<0||index>52)
    throw new Error("Invalid Class scheduling week.");
  const [datePart,timePart]=firstLocal.split("T");
  const [year,month,day]=datePart!.split("-").map(Number);
  const [hour,minute]=timePart!.split(":").map(Number);
  return new Date(Date.UTC(year,month-1,day+index*7,hour,minute)).toISOString().slice(0,16);
}
export function buildSiteClassMeetings(
  meetings:readonly LocalMeeting[],timeZone:string,
):SiteMeeting[]{
  validateSiteTimeZone(timeZone);
  if(meetings.length<1||meetings.length>12)
    throw new Error("A Class needs between 1 and 12 scheduled meetings.");
  return meetings.map(meeting=>{
    if(!Number.isInteger(meeting.durationMinutes)||meeting.durationMinutes<15||
        meeting.durationMinutes>480)throw new Error("Class meetings must be 15–480 minutes.");
    const start=localClassTimeToInstant(meeting.localStart,timeZone);
    return {requestId:meeting.requestId,startsAt:start.toISOString(),
      endsAt:new Date(start.getTime()+meeting.durationMinutes*60000).toISOString()};
  });
}
export function displaySiteClassTime(iso:string,timeZone:string):string{
  return new Intl.DateTimeFormat("en-US",{
    timeZone:validateSiteTimeZone(timeZone),
    year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",
    timeZoneName:"short",
  }).format(new Date(iso));
}
