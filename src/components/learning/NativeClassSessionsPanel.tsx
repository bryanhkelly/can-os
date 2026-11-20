import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox, Radio } from "@/components/ui/choice";
import { Link } from "@tanstack/react-router";
import { normalizeClientError } from "@/lib/client-error";
import { buildSiteClassMeetings, displaySiteClassTime, siteWallWeek, type LocalMeeting } from "@/domain/class-session-local-time";
import { scheduleNativeClassSessions, openNativeClassSession, revokeNativeClassSession, changeNativeClassSessionSchedule } from "@/modules/classes/native-class-sessions.functions";
import { NativeClassroomHostPanel } from "@/components/learning/NativeClassroomHostPanel";
import { NativeClassSessionAgenda } from "@/components/learning/NativeClassSessionAgenda";
import { NativeClassScheduleForm, type ClassScheduleMode, type ClassScheduleRow } from "@/components/learning/NativeClassScheduleForm";
import { nativeClassSessionDisplayStatus } from "@/domain/native-class-sessions";
import type { getNativeClassWorkspace } from "@/modules/classes/native-class-workspace.functions";

type ClassWorkspace=Awaited<ReturnType<typeof getNativeClassWorkspace>>;

function newClassScheduleRow():ClassScheduleRow{
  return {id:crypto.randomUUID(),localStart:"",minutes:60};
}
export function NativeClassSessionsPanel({
  workspace,canSchedule=false,showConsole=false,canRevoke=false,onChanged,
}:{
  workspace:ClassWorkspace;canSchedule?:boolean;showConsole?:boolean;canRevoke?:boolean;
  onChanged?:()=>Promise<unknown>;
}){
  const [mode,setMode]=useState<ClassScheduleMode>("weekly");
  const [first,setFirst]=useState("");
  const [minutes,setMinutes]=useState(60);
  const [customRows,setClassScheduleRows]=useState<ClassScheduleRow[]>([newClassScheduleRow()]);
  const [requestIds,setRequestIds]=useState<string[]>([]);
  const [scheduled,setScheduled]=useState(false);
  const [prepared,setPrepared]=useState({media:false,display:false,room:false,captions:false,backup:false});
  const siteTimeZone=workspace.siteTimeZone;
  const [busy,setBusy]=useState(false);
  const [opened,setOpened]=useState<{roomId:string;pairingCode:string|null;expiresAt:string|null}|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [revoking,setRevoking]=useState<string|null>(null);
  const [agendaSession,setAgendaSession]=useState<string|null>(null);
  const [revocationReason,setRevocationReason]=useState("");
  const [changeSessionId,setChangeSessionId]=useState<string|null>(null);
  const [changeMode,setChangeMode]=useState<"replace"|"cancel">("replace");
  const [changeLocalStart,setChangeLocalStart]=useState("");
  const [changeDuration,setChangeDuration]=useState(60);
  const [changeReason,setChangeReason]=useState("");
  const [changeRequestId,setChangeRequestId]=useState(()=>crypto.randomUUID());
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
  function changeRow(id:string,update:Partial<Pick<ClassScheduleRow,"localStart"|"minutes">>){
    resetSchedule();
    setClassScheduleRows(current=>current.map(row=>row.id===id?{
      ...row,...update,
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
  async function changeSchedule(sessionId:string){
    if(busy||!canSchedule||changeSessionId!==sessionId||changeReason.trim().length<15)return;
    setBusy(true);setError("");setNotice("");
    try{
      const meeting=changeMode==="replace"?
        buildSiteClassMeetings([{
          requestId:changeRequestId,localStart:changeLocalStart,
          durationMinutes:changeDuration,
        }],siteTimeZone)[0]:null;
      const result=await changeNativeClassSessionSchedule({data:{
        classId:workspace.classId,classSessionId:sessionId,
        requestId:changeRequestId,reason:changeReason.trim(),
        replacement:meeting?{startsAt:meeting.startsAt,endsAt:meeting.endsAt}:null,
      }});
      // The transaction may have committed even if cache invalidation fails.
      // Never misreport a successful cancellation as a failed write.
      const [refresh]=await Promise.allSettled([onChanged?.()??Promise.resolve()]);
      setChangeSessionId(null);setChangeReason("");
      setChangeLocalStart("");setChangeRequestId(crypto.randomUUID());
      setNotice(result.replacementSessionId?
        "The original Session is cancelled and its new dated Session is linked in the audit history. Review the replacement study plan.":
        "The unopened Session was cancelled. Existing Class enrollment and learning history were not changed.");
      if(refresh?.status==="rejected")setNotice("Session changed successfully. Refresh the Class page to see the latest schedule.");
    }catch(e){
      setError(normalizeClientError(e,"Unable to change this Class Session.").message);
    }finally{setBusy(false);}
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
      <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Verified classroom prerequisites">
        <p className="border border-border p-3 text-sm">
          <strong>Current Class roster count:</strong> {workspace.rosterCount}
          <span className="block text-xs text-muted-foreground">
            {workspace.rosterCount>0 ? "A roster exists; active registration, Site assignment and Class access are independently checked before pairing."
              : "No enrolled learner is listed. Verify registration before inviting participants."}
          </span>
        </p>
        <p className="border border-border p-3 text-sm">
          <strong>Current Site and facilitator:</strong> {canSchedule&&workspace.siteId?"Authorized to plan":"Not verified"}
          <span className="block text-xs text-muted-foreground">
            Opening a room and playing media separately recheck current Site, staff and content rights.
          </span>
        </p>
        <p className="border border-border p-3 text-sm">
          <strong>Scheduled Sessions:</strong> {workspace.sessions.filter(session=>session.state==="scheduled"||session.roomState==="live").length}
          <span className="block text-xs text-muted-foreground">
            Room start is available only inside the permitted Session window.
          </span>
        </p>
        <p className="border border-border p-3 text-sm">
          <strong>Video authorization:</strong> Checked at playback
          <span className="block text-xs text-muted-foreground">
            This checklist does not authorize media. Use the room's approved recording catalog.
          </span>
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {([
          ["media","Approved lesson and captions checked"],
          ["display","TV, audio and projected text checked"],
          ["room","Participant joining instructions ready"],
          ["captions","Captions/transcript and readable slides checked"],
          ["backup","Bandwidth and facilitator recovery plan checked"],
        ] as const).map(([key,label])=><Label key={key}
          className="flex min-h-11 items-start gap-2 border border-border p-3 text-sm">
          <Checkbox checked={prepared[key]}
            onChange={e=>setPrepared(current=>({...current,[key]:e.target.checked}))}
            className="mt-1"/>
          {label}
        </Label>)}
      </div>
      {!Object.values(prepared).every(Boolean)&&<p className="mt-2 text-xs text-muted-foreground">
        {Object.values(prepared).filter(Boolean).length} of {Object.values(prepared).length} preparation checks acknowledged.
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
            Status: {({
              scheduled:"Scheduled",
              live:"Live classroom",
              ended:"After Class · Ended",
              started:"Started",
              cancelled:"Cancelled",
              elapsed_unverified:"Session window elapsed · Delivery not verified",
            } as const)[nativeClassSessionDisplayStatus({
              state:session.state,roomState:session.roomState,
              endsAt:session.endsAt,now:new Date(),
            })]}
          </p>
          {workspace.sessionAgendasEnabled&&session.state==="scheduled"&&
            <p className="mt-2 text-xs text-muted-foreground">
              {session.agendaReady
                ?"Study plan published for this Session."
                :session.agendaRequired
                  ?"Study plan required before opening this newly scheduled Session."
                  :"Study plan optional for this pre-activation Session."}
            </p>}
          {workspace.sessionAgendasEnabled&&<Button type="button" variant="outline"
            size="sm" className="mt-2"
            onClick={()=>setAgendaSession(current=>current===session.id?null:session.id)}>
            {agendaSession===session.id?"Hide study plan":"View study plan"}
          </Button>}
          {workspace.sessionAgendasEnabled&&agendaSession===session.id&&
            <NativeClassSessionAgenda key={session.id}
              classId={workspace.classId} classSessionId={session.id}
              view={workspace.view} onPublished={onChanged}
              canEdit={canSchedule&&session.isMySession&&session.state==="scheduled"}/>}
        </div>
        {canRevoke&&session.roomId&&session.roomState==="live"&&
          <div className="space-y-2">
            {revoking!==session.id?<Button variant="outline" size="sm"
              onClick={()=>{setRevoking(session.id);setRevocationReason("");}}>
              Emergency revoke room
            </Button>:<>
              <Label htmlFor={"revoke-"+session.id} className="block text-xs font-semibold">
                Revocation reason (audited)
              </Label>
              <Textarea id={"revoke-"+session.id} rows={2} minLength={15} maxLength={500}
                
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
        {canSchedule&&session.isMySession&&session.state==="scheduled"&&
          <div className="space-y-3 sm:col-span-2">
            {changeSessionId!==session.id?
              <Button type="button" size="sm" variant="outline" disabled={busy}
                onClick={()=>{setChangeSessionId(session.id);setChangeMode("replace");
                  setChangeReason("");setChangeLocalStart("");setChangeRequestId(crypto.randomUUID());}}>
                Cancel or reschedule Session
              </Button>:
              <div className="border border-border bg-muted/20 p-3 space-y-3"
                aria-label="Change future Class Session">
                <h4 className="text-sm font-semibold">Change this unopened Session</h4>
                <p className="text-xs text-muted-foreground">
                  The original Session, timetable and audit history are preserved.
                  Rescheduling creates a new Session at the same authorized Site.
                </p>
                <fieldset className="flex flex-wrap gap-4 text-sm">
                  <legend className="font-semibold">Change type</legend>
                  {([["replace","Reschedule"],["cancel","Cancel without replacement"]] as const)
                    .map(([value,label])=><Label key={value} className="flex items-center gap-2">
                      <Radio checked={changeMode===value}
                        name={"change-"+session.id} onChange={()=>{setChangeMode(value);
                          setChangeRequestId(crypto.randomUUID());}}/>
                      {label}
                    </Label>)}
                </fieldset>
                {changeMode==="replace"&&<div className="grid gap-3 sm:grid-cols-2">
                  <Label className="text-xs font-semibold">
                    New date and time ({siteTimeZone})
                    <Input type="datetime-local" value={changeLocalStart} required
                      className="mt-1 min-h-11"
                      onChange={e=>{setChangeLocalStart(e.target.value);
                        setChangeRequestId(crypto.randomUUID());}}/>
                  </Label>
                  <Label className="text-xs font-semibold">
                    Length (minutes)
                    <Input type="number" min={15} max={480} step={15}
                      value={changeDuration}
                      className="mt-1 min-h-11"
                      onChange={e=>{setChangeDuration(Number(e.target.value));
                        setChangeRequestId(crypto.randomUUID());}}/>
                  </Label>
                </div>}
                <Label className="block text-xs font-semibold">
                  Reason (audited, at least 15 characters)
                  <Textarea value={changeReason} rows={2} maxLength={500}
                    className="mt-1"
                    onChange={e=>{setChangeReason(e.target.value);
                      setChangeRequestId(crypto.randomUUID());}}/>
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={busy||
                    changeReason.trim().length<15||
                    (changeMode==="replace"&&!changeLocalStart)}
                    onClick={()=>void changeSchedule(session.id)}>
                    {busy?"Saving…":changeMode==="replace"?"Confirm reschedule":"Confirm cancellation"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy}
                    onClick={()=>setChangeSessionId(null)}>Keep original Session</Button>
                </div>
              </div>}
          </div>}
        {canSchedule&&session.isMySession&&<div className="flex flex-wrap items-center gap-2">
          {session.state==="scheduled"&&<Button size="sm" variant="outline" disabled={busy}
            onClick={()=>void start(session.id)}>Open room</Button>}
          {session.roomId&&session.roomState==="live"&&<Link
            to="/class/$classId" params={{classId:workspace.classId}}
            search={{view:"teach",tab:"classroom",session:session.id,lesson:undefined}}
            className="text-sm font-semibold underline">Resume authorized live controls</Link>}
          {session.roomId&&session.roomState==="live"&&<Link to="/classroom/$sessionId/presentation"
            params={{sessionId:session.roomId}} search={{layout:"presentation"}}
            className="text-sm font-semibold underline">Audience display</Link>}
          <span className="text-xs text-muted-foreground">Your Class Session</span>
        </div>}
      </li>)}
    </ol>:<p className="mt-4 text-sm text-muted-foreground">
      {workspace.deliveryMode==="self_paced"
        ?"This Class is self-paced. Open Lessons to study and practice in your own Course Attempt."
        :"No dated Sessions are scheduled for this Class."}
    </p>}
    {opened&&<div className="mt-4 border border-border bg-muted/30 p-4">
      <p className="text-sm font-semibold">Classroom started</p>
      {opened.pairingCode&&<p className="mt-2 text-lg font-bold tracking-wide">
        Join code: {opened.pairingCode}
      </p>}
      {opened.expiresAt&&<p className="mt-1 text-xs text-muted-foreground">
        One-time pairing expires: {displaySiteClassTime(opened.expiresAt,siteTimeZone)}
      </p>}
      <Link to="/classroom/$sessionId/presentation" params={{sessionId:opened.roomId}} search={{layout:"presentation"}}
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
        roomId={activeSession.roomId} classId={workspace.classId}
        classSessionId={activeSession.id} agendasEnabled={workspace.sessionAgendasEnabled}
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
    {canSchedule&&workspace.siteId&&<NativeClassScheduleForm
      classId={workspace.classId} siteTimeZone={siteTimeZone}
      mode={mode} first={first} minutes={minutes} customRows={customRows}
      busy={busy} scheduled={scheduled}
      onModeChange={value=>{setMode(value);resetSchedule();}}
      onFirstChange={value=>{setFirst(value);resetSchedule();}}
      onMinutesChange={value=>{setMinutes(value);resetSchedule();}}
      onRowChange={changeRow}
      onRemoveRow={id=>{setClassScheduleRows(rows=>rows.filter(item=>item.id!==id));resetSchedule();}}
      onAddRow={()=>{setClassScheduleRows(rows=>[...rows,newClassScheduleRow()]);resetSchedule();}}
      onSubmit={createMeetings}/>}

    {notice&&<p role="status" className="mt-4 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-4 text-sm">{error}</p>}
  </section>;
}
