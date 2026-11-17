import { AuthorizationError } from "./command-context";

export type ClassSessionTime = {
  requestId:string;
  startsAt:string;
  endsAt:string;
};
export type ClassSessionCadence="custom"|"weekly";

/** Pure scheduling contract, independent of the underlying delivery provider.
 * A four-week series follows the local calendar, tolerating DST ±1h.
 * Custom cadence remains available for school and summer Classes.
 */
export function assertNativeClassSessionSeries(
  meetings:readonly ClassSessionTime[],cadence:ClassSessionCadence,
):void{
  if(meetings.length<1 || meetings.length>12)
    throw new AuthorizationError("between one and twelve Class Sessions");
  const seen=new Set<string>();
  const starts:number[]=[];
  const lengths:number[]=[];
  const ends:number[]=[];
  for(const meeting of meetings){
    if(seen.has(meeting.requestId))
      throw new AuthorizationError("distinct Class Session request identities");
    seen.add(meeting.requestId);
    const start=new Date(meeting.startsAt).getTime();
    const end=new Date(meeting.endsAt).getTime();
    if(!Number.isFinite(start)||!Number.isFinite(end)||
       end-start<15*60000||end-start>8*3600000)
      throw new AuthorizationError("a Class Session lasts 15 minutes to eight hours");
    if(starts.length&&start<ends[ends.length-1]!)
      throw new AuthorizationError("Class Sessions must be ordered and cannot overlap");
    starts.push(start);
    ends.push(end);
    lengths.push(end-start);
  }
  if(cadence==="weekly"){
    if(meetings.length!==4)
      throw new AuthorizationError("four consecutive weekly Class Sessions");
    for(let i=1;i<4;i++){
      if(Math.abs(starts[i]!-starts[i-1]!-7*86400000)>3600000 ||
         lengths[i]!==lengths[0])
        throw new AuthorizationError("four consecutive weekly Sessions of equal duration");
    }
  }
}

/** Read-only display classification. Elapsed Sessions are NOT attendance
 * absences, academic failures or completed learning, and never write status. */
export function nativeClassSessionDisplayStatus(input: {
  state:"scheduled"|"started"|"cancelled";
  roomState:"live"|"ended"|null;
  endsAt:string;
  now:Date;
}):"scheduled"|"live"|"ended"|"cancelled"|"elapsed_unverified"|"started" {
  if(input.state==="cancelled")return "cancelled";
  if(input.roomState==="ended")return "ended";
  if(input.roomState==="live")return "live";
  if(input.state==="started")return "started";
  const endsAt=new Date(input.endsAt).getTime();
  if(Number.isFinite(endsAt)&&Number.isFinite(input.now.getTime())&&
     endsAt<=input.now.getTime())return "elapsed_unverified";
  return "scheduled";
}

/** Scheduled meetings are cancellable only before their start and before
 * any live facilitated room is attached. No attendance or Class Enrollment
 * state is inferred from a cancellation. */
export function canChangeUnopenedClassSession(input:{
  planState:"scheduled"|"started"|"cancelled";
  facilitatedSessionId:string|null;
  scheduledStartsAt:Date;
  now:Date;
}):boolean{
  return input.planState==="scheduled"&&
    input.facilitatedSessionId===null&&
    Number.isFinite(input.scheduledStartsAt.getTime())&&
    Number.isFinite(input.now.getTime())&&
    input.scheduledStartsAt.getTime()>input.now.getTime();
}
