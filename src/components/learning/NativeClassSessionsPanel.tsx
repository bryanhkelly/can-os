import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import { scheduleNativeClassSessions } from "@/modules/classes/native-class-sessions.functions";
import type { getNativeClassWorkspace } from "@/modules/classes/native-class-workspace.functions";

type ClassWorkspace=Awaited<ReturnType<typeof getNativeClassWorkspace>>;

function utcDisplay(value:string):string{
  return value.replace("T"," ").slice(0,16)+" UTC";
}
function buildFourWeekMeetings(firstLocal:string,durationMinutes:number,ids:string[]){
  const start=new Date(firstLocal);
  if(!Number.isFinite(start.getTime()) || !Number.isInteger(durationMinutes) ||
     durationMinutes<15||durationMinutes>480||ids.length!==4){
    throw new Error("Choose a valid future start time and a 15–480-minute duration.");
  }
  return ids.map((requestId,index)=>{
    const day=new Date(start);
    // Advance calendar weeks in the facilitator's local timezone, not by a
    // fixed millisecond duration that may shift across DST.
    day.setDate(day.getDate()+index*7);
    const end=new Date(day.getTime()+durationMinutes*60_000);
    return {requestId,startsAt:day.toISOString(),endsAt:end.toISOString()};
  });
}

export function NativeClassSessionsPanel({
  workspace,canSchedule=false,onChanged,
}:{
  workspace:ClassWorkspace;canSchedule?:boolean;onChanged?:()=>Promise<unknown>;
}){
  const [first,setFirst]=useState("");
  const [minutes,setMinutes]=useState(60);
  const [requestIds,setRequestIds]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  async function createFour(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!canSchedule||!workspace.siteId)return;
    setError("");setNotice("");setBusy(true);
    try{
      const ids=requestIds.length===4?requestIds:
        Array.from({length:4},()=>crypto.randomUUID());
      if(requestIds.length!==4)setRequestIds(ids);
      const meetings=buildFourWeekMeetings(first,minutes,ids);
      const result=await scheduleNativeClassSessions({data:{
        classId:workspace.classId,cadence:"weekly",meetings,
      }});
      await onChanged?.();
      setNotice(result.created+" dated Class Sessions scheduled. No room playback or attendance has been activated.");
    }catch(e){
      setError(normalizeClientError(e,"Unable to schedule this Class.").message);
    }finally{setBusy(false)}
  }
  return <section className="border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">Class Sessions</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Dates come from the canonical delivery timetable. Scheduling does not
      enroll learners, verify attendance, or authorize projected video playback.
    </p>
    {workspace.sessions.length?<ol className="mt-4 divide-y divide-border border-t border-border">
      {workspace.sessions.map((session,index)=><li key={session.id}
        className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-sm font-semibold">Session {index+1}</p>
          <p className="mt-1 text-sm">{utcDisplay(session.startsAt)}
            {" to "}{utcDisplay(session.endsAt)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Status: {session.state==="scheduled"?"Scheduled":
              session.state==="started"?"Started":"Cancelled"}
          </p>
        </div>
        {session.isMySession&&<span className="text-xs text-muted-foreground">
          You are the assigned session facilitator
        </span>}
      </li>)}
    </ol>:<p className="mt-4 text-sm text-muted-foreground">
      No dated Sessions are scheduled for this Class.
    </p>}
    {workspace.sessionsTruncated&&<p className="mt-4 text-sm text-muted-foreground">
      Showing the first 100 Sessions. Additional results require pagination.
    </p>}
    {canSchedule&&workspace.siteId&&<form onSubmit={e=>void createFour(e)}
      className="mt-6 space-y-4 border-t border-border pt-5">
      <h3 className="text-base font-semibold">Schedule a four-week series</h3>
      <p className="text-sm text-muted-foreground">
        Four consecutive weekly meetings at this Class's approved hosting Site.
        Only a currently assigned teacher or facilitator may schedule.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="native-series-start" className="block text-sm font-semibold">
          First session (your local time)
        </label>
          <input id="native-series-start" type="datetime-local" required value={first}
            onChange={e=>{setFirst(e.target.value);setRequestIds([]);}}
            className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
        </div>
        <div><label htmlFor="native-series-duration" className="block text-sm font-semibold">
          Duration (minutes)
        </label>
          <input id="native-series-duration" type="number" required min={15} max={480}
            value={minutes} onChange={e=>{setMinutes(Number(e.target.value));setRequestIds([]);}}
            className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
        </div>
      </div>
      <Button type="submit" disabled={!first||busy}>
        {busy?"Scheduling…":"Schedule four Sessions"}
      </Button>
    </form>}
    {notice&&<p role="status" className="mt-4 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-4 text-sm">{error}</p>}
  </section>;
}
