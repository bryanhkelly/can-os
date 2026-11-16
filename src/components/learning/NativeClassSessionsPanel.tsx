import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { normalizeClientError } from "@/lib/client-error";
import { buildSiteClassMeetings, displaySiteClassTime, siteWallWeek, type LocalMeeting } from "@/domain/class-session-local-time";
import { scheduleNativeClassSessions, openNativeClassSession, revokeNativeClassSession } from "@/modules/classes/native-class-sessions.functions";
import { NativeClassroomHostPanel } from "@/components/learning/NativeClassroomHostPanel";
import type { getNativeClassWorkspace } from "@/modules/classes/native-class-workspace.functions";

type ClassWorkspace=Awaited<ReturnType<typeof getNativeClassWorkspace>>;

type SchedulingMode="weekly"|"single"|"custom";
type CustomRow={id:string;localStart:string;minutes:number};
function newCustomRow():CustomRow{
  return {id:crypto.randomUUID(),localStart:"",minutes:60};
}
export function NativeClassSessionsPanel({
  workspace,canSchedule=false,showConsole=false,canRevoke=false,onChanged,
}:{
  workspace:ClassWorkspace;canSchedule?:boolean;showConsole?:boolean;canRevoke?:boolean;
  onChanged?:()=>Promise<unknown>;
}){
  const [mode,setMode]=useState<SchedulingMode>("weekly");
  const [first,setFirst]=useState("");
  const [minutes,setMinutes]=useState(60);
  const [customRows,setCustomRows]=useState<CustomRow[]>([newCustomRow()]);
  const [requestIds,setRequestIds]=useState<string[]>([]);
  const [scheduled,setScheduled]=useState(false);
  const [prepared,setPrepared]=useState({media:false,display:false,room:false});
  const siteTimeZone=workspace.siteTimeZone;
  const [busy,setBusy]=useState(false);
  const [opened,setOpened]=useState<{roomId:string;pairingCode:string|null;expiresAt:string|null}|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [revoking,setRevoking]=useState<string|null>(null);
  const [revocationReason,setRevocationReason]=useState("");
  const activeSession=workspace.sessions.find(session=>
    session.id===workspace.selectedSessionId &&
    session.isMySession && session.roomState==="live") ??
    workspace.sessions.find(session=>session.isMySession && session.roomState==="live");
  async function createMeetings(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||scheduled||!canSchedule||!workspace.siteId)return;
    setError("");setNotice("");setBusy(true);
    try{
      const wanted=mode==="weekly"?4:mode==="single"?1:customRows.length;
      const ids=requestIds.length===wanted?requestIds:
        Array.from({length:wanted},()=>crypto.randomUUID());
      if(requestIds.length!==wanted)setRequestIds(ids);
      const local:LocalMeeting[]=mode==="custom"?
        customRows.map((row,index)=>({
          requestId:ids[index]!,localStart:row.localStart,durationMinutes:row.minutes,
        })):
        ids.map((id,index)=>({
          requestId:id,
          localStart:mode==="weekly"?siteWallWeek(first,index):first,
          durationMinutes:minutes,
        }));
      const meetings=buildSiteClassMeetings(local,siteTimeZone);
      const result=await scheduleNativeClassSessions({data:{
        classId:workspace.classId,
        cadence:mode==="weekly"?"weekly":"custom",meetings,
      }});
      await onChanged?.();
      setScheduled(true);
      setNotice(result.created+" Class Session"+(result.created===1?"":"s")+
        " scheduled in "+siteTimeZone+". Scheduling does not record learner attendance.");
    }catch(e){
      setError(normalizeClientError(e,"Unable to schedule this Class.").message);
    }finally{setBusy(false);}
  }
  function resetSchedule(){
    setRequestIds([]);
    setScheduled(false);
  }
  function changeRow(id:string,update:Partial<Pick<CustomRow,"localStart"|"minutes">>){
    resetSchedule();
    setCustomRows(current=>current.map(row=>row.id===id?{
      ...row,...update,id:crypto.randomUUID(),
    }:row));
  }
  async function start(classSessionId:string){
    if(!canSchedule||busy)return;
    setError("");setNotice("");setOpened(null);setBusy(true);
    try{
      const room=await openNativeClassSession({data:{
        classId:workspace.classId,classSessionId,
      }});
      setOpened({roomId:room.facilitatedSessionId,
        pairingCode:room.pairingCode,expiresAt:room.pairingExpiresAt});
      await onChanged?.();
      setNotice(room.alreadyStarted?
        "Room is already started. Its previous one-time pairing code is not reproduced.":
        "Classroom started. The join code is shown only to the authorized facilitator.");
    }catch(e){setError(normalizeClientError(e,"Cannot open this Class Session.").message)}
    finally{setBusy(false)}
  }
  async function revoke(classSessionId:string){
    if(busy||revoking!==classSessionId||revocationReason.trim().length<15)return;
    setError("");setNotice("");setBusy(true);
    try{
      await revokeNativeClassSession({data:{classId:workspace.classId,
        classSessionId,reason:revocationReason.trim()}});
      await onChanged?.();
      setRevoking(null);setRevocationReason("");
      setNotice("Room revoked. Existing learning and attendance evidence was preserved.");
    }catch(e){setError(normalizeClientError(e,"Room revocation denied.").message)}
    finally{setBusy(false)}
  }
  return <section className="border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">Class Sessions</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Dates come from the canonical delivery timetable. Scheduling does not
      enroll learners, verify attendance, or authorize projected video playback.
    </p>
    {canSchedule&&<section className="mt-4 border border-border bg-muted/20 p-4"
      aria-label="Prepare this classroom">
      <h3 className="text-base font-semibold">Before Class · Ready to teach</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Check your classroom setup before opening the room. These are local preparation
        reminders, not stored attendance or compliance evidence.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {([
          ["media","Approved lesson and captions checked"],
          ["display","TV, audio and projected text checked"],
          ["room","Participant joining instructions ready"],
        ] as const).map(([key,label])=><label key={key}
          className="flex min-h-11 items-start gap-2 border border-border p-3 text-sm">
          <input type="checkbox" checked={prepared[key]}
            onChange={e=>setPrepared(current=>({...current,[key]:e.target.checked}))}
            className="mt-1"/>
          {label}
        </label>)}
      </div>
      {!Object.values(prepared).every(Boolean)&&<p className="mt-2 text-xs text-muted-foreground">
        {Object.values(prepared).filter(Boolean).length} of 3 preparation checks acknowledged.
        You can still open a classroom if you need to.
      </p>}
    </section>}
    {workspace.sessions.length?<ol className="mt-4 divide-y divide-border border-t border-border">
      {workspace.sessions.map((session,index)=><li key={session.id}
        className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-sm font-semibold">Session {index+1}</p>
          <p className="mt-1 text-sm">{displaySiteClassTime(session.startsAt,siteTimeZone)}
            {" to "}{displaySiteClassTime(session.endsAt,siteTimeZone)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Status: {session.roomState==="ended"?"After Class · Ended":
              session.state==="scheduled"?"Scheduled":
              session.state==="started"?"Started":"Cancelled"}
          </p>
        </div>
        {canRevoke&&session.roomId&&session.roomState==="live"&&
          <div className="space-y-2">
            {revoking!==session.id?<Button variant="outline" size="sm"
              onClick={()=>{setRevoking(session.id);setRevocationReason("");}}>
              Emergency revoke room
            </Button>:<>
              <label htmlFor={"revoke-"+session.id} className="block text-xs font-semibold">
                Revocation reason (audited)
              </label>
              <textarea id={"revoke-"+session.id} rows={2} minLength={15} maxLength={500}
                className="w-full border border-border bg-background p-2 text-sm"
                value={revocationReason}
                onChange={event=>setRevocationReason(event.target.value)}/>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy||revocationReason.trim().length<15}
                  onClick={()=>void revoke(session.id)}>Confirm emergency stop</Button>
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={()=>setRevoking(null)}>Cancel</Button>
              </div>
            </>}
          </div>}
        {canSchedule&&session.isMySession&&<div className="flex flex-wrap items-center gap-2">
          {session.state==="scheduled"&&<Button size="sm" variant="outline" disabled={busy}
            onClick={()=>void start(session.id)}>Open room</Button>}
          {session.roomId&&session.roomState==="live"&&<Link
            to="/classes/$classId" params={{classId:workspace.classId}}
            search={{view:"teach",tab:"classroom",session:session.id,lesson:undefined}}
            className="text-sm font-semibold underline">Private class controls</Link>}
          {session.roomId&&session.roomState==="live"&&<Link to="/classroom/$sessionId/presentation"
            params={{sessionId:session.roomId}}
            className="text-sm font-semibold underline">Audience display</Link>}
          <span className="text-xs text-muted-foreground">Your Class Session</span>
        </div>}
      </li>)}
    </ol>:<p className="mt-4 text-sm text-muted-foreground">
      No dated Sessions are scheduled for this Class.
    </p>}
    {opened&&<div className="mt-4 border border-border bg-muted/30 p-4">
      <p className="text-sm font-semibold">Classroom started</p>
      {opened.pairingCode&&<p className="mt-2 text-lg font-bold tracking-wide">
        Join code: {opened.pairingCode}
      </p>}
      {opened.expiresAt&&<p className="mt-1 text-xs text-muted-foreground">
        One-time pairing expires: {displaySiteClassTime(opened.expiresAt,siteTimeZone)}
      </p>}
      <Link to="/classroom/$sessionId/presentation" params={{sessionId:opened.roomId}}
        hash={opened.pairingCode&&opened.expiresAt
          ?"pair="+encodeURIComponent(opened.pairingCode)+"&expires="+encodeURIComponent(opened.expiresAt)
          :undefined}
        className="mt-3 inline-block text-sm font-semibold underline">Open shared-screen projector</Link>
      <p className="mt-3 text-xs text-muted-foreground">
        A paired device is not proof of learner attendance or lesson completion.
      </p>
    </div>}
    {showConsole&&canSchedule&&activeSession?.roomId&&
      <NativeClassroomHostPanel key={activeSession.roomId}
        roomId={activeSession.roomId}
        canReviewAttendance={workspace.canVerifyAttendance}
        initialCode={opened?.roomId===activeSession.roomId?opened.pairingCode:null}
        initialExpiry={opened?.roomId===activeSession.roomId?opened.expiresAt:null}
        onClosed={async()=>{setOpened(null);await onChanged?.();}}
      />}
    {showConsole&&canSchedule&&!activeSession&&
      <p role="status" className="mt-5 border border-border p-4 text-sm">
        Open an authorized scheduled Session to use the private playback,
        activity and attendance controls.
      </p>}
    {workspace.sessionsTruncated&&<p className="mt-4 text-sm text-muted-foreground">
      Showing the first 100 Sessions. Additional results require pagination.
    </p>}
    {canSchedule&&workspace.siteId&&<form onSubmit={e=>void createMeetings(e)}
      className="mt-6 space-y-4 border-t border-border pt-5">
      <h3 className="text-base font-semibold">Schedule Class Sessions</h3>
      <p className="text-sm text-muted-foreground">
        Enter times in the hosting Site's time zone:
        <strong> {siteTimeZone}</strong>. Meetings retain local wall-clock time
        across daylight-saving changes. Ambiguous or missing times are rejected.
      </p>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-2 text-sm font-semibold">Schedule type</legend>
        {([
          ["weekly","Four weekly Sessions"],
          ["single","One Session"],
          ["custom","Custom dates (up to 12)"],
        ] as const).map(([value,label])=><label key={value}
          className="flex min-h-11 items-center gap-2 border border-border px-3 text-sm">
          <input type="radio" name={"native-schedule-"+workspace.classId}
            checked={mode===value} onChange={()=>{setMode(value);resetSchedule();}}/>
          {label}
        </label>)}
      </fieldset>
      {mode!=="custom"?<div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="native-series-start" className="block text-sm font-semibold">
          {mode==="weekly"?"First Session":"Session"} start ({siteTimeZone})
        </label>
          <input id="native-series-start" type="datetime-local" required value={first}
            onChange={e=>{setFirst(e.target.value);resetSchedule();}}
            className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
        </div>
        <div><label htmlFor="native-series-duration" className="block text-sm font-semibold">
          Duration (minutes)
        </label>
          <input id="native-series-duration" type="number" required min={15} max={480}
            value={minutes} onChange={e=>{setMinutes(Number(e.target.value));resetSchedule();}}
            className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
        </div>
      </div>:<div className="space-y-3">
        {customRows.map((row,index)=><div key={row.id}
          className="grid items-end gap-3 border border-border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
          <div>
            <label className="text-sm font-semibold" htmlFor={"class-custom-"+row.id}>
              Session {index+1} start ({siteTimeZone})
            </label>
            <input id={"class-custom-"+row.id} type="datetime-local" required
              value={row.localStart} onChange={e=>changeRow(row.id,{localStart:e.target.value})}
              className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor={"class-minutes-"+row.id}>
              Minutes
            </label>
            <input id={"class-minutes-"+row.id} type="number" min={15} max={480} required
              value={row.minutes} onChange={e=>changeRow(row.id,{minutes:Number(e.target.value)})}
              className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          </div>
          <Button size="sm" variant="outline" type="button" disabled={customRows.length<=1||busy}
            onClick={()=>{setCustomRows(rows=>rows.filter(item=>item.id!==row.id));resetSchedule();}}>
            Remove
          </Button>
        </div>)}
        <Button type="button" variant="outline" disabled={busy||customRows.length>=12}
          onClick={()=>{setCustomRows(rows=>[...rows,newCustomRow()]);resetSchedule();}}>
          Add another Session
        </Button>
      </div>}
      <Button type="submit" disabled={scheduled||busy||
        (mode!=="custom"&&!first)||(mode==="custom"&&customRows.some(row=>!row.localStart))}>
        {busy?"Scheduling…":scheduled?"Sessions scheduled":"Schedule "+(mode==="weekly"?"four Sessions":mode==="single"?"one Session":"custom Sessions")}
      </Button>
      {scheduled&&<p role="status" className="text-sm">
        Saved. Change the date, duration or schedule type to create another booking.
      </p>}
    </form>}
    {notice&&<p role="status" className="mt-4 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-4 text-sm">{error}</p>}
  </section>;
}
