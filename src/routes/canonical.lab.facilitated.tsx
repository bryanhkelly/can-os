import { compactUuidUrlValue } from "@/domain/opaque-url-id";
import { Label } from "@/components/ui/label";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WorkspaceShell, StatusBadge, ActionDialog, MutationFeedback, WorkspaceNotice } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { invalidateRouterAndCheck } from "@/lib/router-refresh";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ClassroomFacilitatorConsole } from "@/components/learning/ClassroomFacilitatorConsole";
import { ClassroomConnectQr } from "@/components/learning/ClassroomConnectQr";
import { ClassroomRehearsalPlayer } from "@/components/learning/ClassroomRehearsalPlayer";
import { ClassroomSchedulePanel } from "@/components/learning/ClassroomSchedulePanel";
import { ClassroomAttendancePanel } from "@/components/learning/ClassroomAttendancePanel";
import { ClassroomAssistedActivityPanel } from "@/components/learning/ClassroomAssistedActivityPanel";
import { ClassroomSurveyManager } from "@/components/learning/ClassroomSurveyManager";
import { getClassroomRehearsalChoices } from "@/modules/learning/classroom-rehearsal.functions";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import {
  endFacilitatedLearningRoom, getFacilitatedHostWorkspace,
  renewFacilitatedLearningPairing, startFacilitatedLearningRoom,
} from "@/modules/learning/facilitated-learning.functions";

export const Route = createFileRoute("/canonical/lab/facilitated")({
  validateSearch: (raw:Record<string,unknown>):{siteId?:string} => ({
    siteId:typeof raw.siteId==="string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.siteId)
      ? raw.siteId : undefined,
  }),
  loader: () => safeLoader(() => getFacilitatedHostWorkspace())(),
  component: FacilitatedLearningLabPage,
});

function FacilitatedLearningLabPage() {
  const result = Route.useLoaderData();
  const {siteId:preferredSiteId}=Route.useSearch();
  if (!result.ok) return <CanonicalBlueprintLoadError
    title="Facilitated learning" message={result.message}/>;
  return <FacilitatedLabContent data={result.data} preferredSiteId={preferredSiteId}/>;
}

type Workspace = Awaited<ReturnType<typeof getFacilitatedHostWorkspace>>;
function effectiveRoomState(room: Workspace["rooms"][number], nowMs: number) {
  return room.state === "live" && Date.parse(room.expiresAt) <= nowMs
    ? "expired" : room.state;
}
function FacilitatedLabContent({data,preferredSiteId}:{
  data:Workspace; preferredSiteId?:string;
}) {
  const router=useRouter();
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const [rehearsalOptions,setRehearsalOptions] =
    useState<Awaited<ReturnType<typeof getClassroomRehearsalChoices>> | null>(null);
  const [rehearsalFailed,setRehearsalFailed]=useState(false);
  const [rehearsalChoice,setRehearsalChoice]=useState("");
  const [rehearsalScope,setRehearsalScope]=useState<{
    deploymentId:string;adoptionId:string;courseVersionId:string;siteId:string;
  } | null>(null);
  useEffect(()=>{
    let live=true;
    void getClassroomRehearsalChoices().then(value=>{
      if(live)setRehearsalOptions(value);
    }).catch(()=>{if(live)setRehearsalFailed(true);});
    return ()=>{live=false;};
  },[]);
  const visibleRehearsalChoices=rehearsalOptions?.choices.filter(choice=>
    !preferredSiteId || choice.siteId===preferredSiteId) ?? [];
  const rehearsal = visibleRehearsalChoices.find(choice=>
    rehearsalChoice===choice.deploymentId+":"+choice.adoptionId+":"+
    choice.courseVersionId+":"+choice.siteId);
  const [selected,setSelected]=useState("");
  const feedback=useMutationFeedback(()=>invalidateRouterAndCheck(router));
  const busy=feedback.pending||feedback.refreshFailed;
  const [message,setMessage]=useState("");
  const [expandedRoomId,setExpandedRoomId]=useState<string|null>(null);
  const [endingRoomId,setEndingRoomId]=useState<string|null>(null);
  const [code,setCode]=useState<{
    roomId:string;code:string;expiresAt:string;
  }|null>(null);
  const visibleChoices=data.choices.filter(choice=>
    !preferredSiteId || choice.siteId===preferredSiteId);
  const visibleRooms=data.rooms.filter(room=>
    !preferredSiteId || room.siteId===preferredSiteId);
  const available=visibleChoices.find(choice=>selected===
    choice.deploymentId+":"+choice.courseVersionId+":"+choice.siteId);
  async function run(action:()=>Promise<void>,successMessage="Room action saved.") {
    if(busy)return;
    setMessage("");
    await feedback.run(action,{
      successMessage,
      commandErrorMessage:"The room action could not be confirmed. Verify your current Site and classroom authority.",
      refreshErrorMessage:"The room action was saved but current room information could not be refreshed. Retry the refresh before taking another action.",
    });
  }
  return <WorkspaceShell width="wide" eyebrow="Canonical · Learning operations"
    title="Facilitated learning" subtitle="One facilitator controls the room, while each enrolled learner may pair their own device. Pairing is not attendance or academic credit.">
    <CapabilityLabNav current="facilitated"/>
    {preferredSiteId&&<p className="mt-3 text-xs text-muted-foreground">
      Site-scoped classroom view. Only Courses, rooms and meetings for the
      requested Site are displayed; all scheduling and playback commands still
      require independent facilitator authorization.
    </p>}
    {preferredSiteId&&visibleChoices.length===0&&<WorkspaceNotice tone="attention" className="mt-3">
      No approved Course delivery is currently authorized for this Site and facilitator.
      Confirm the appointment, Course and deployment before scheduling Classes.
    </WorkspaceNotice>}
    <section className="mt-6 border border-border bg-card p-5" aria-label="Start a shared-screen learning room">
      <h2 className="font-serif text-xl font-semibold">Start a room</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a course available through a current authorized deployment at your Site.
        No new school enrollment or classroom Section is created.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Label className="min-w-72 flex-1 text-sm font-medium">
          Deployment and course
          <Select className="mt-2"
            value={selected} onChange={event=>setSelected(event.target.value)}>
            <option value="">Choose an authorized course</option>
            {visibleChoices.map(choice=><option
              key={choice.deploymentId+":"+choice.courseVersionId+":"+choice.siteId}
              value={choice.deploymentId+":"+choice.courseVersionId+":"+choice.siteId}>
              {choice.deploymentName} · {choice.courseTitle} · Site {choice.siteId.slice(0,8)}
            </option>)}
          </Select>
        </Label>
        <Button disabled={busy||!available} type="button" onClick={()=>void run(async()=>{
          if(!available)return;
          const created=await startFacilitatedLearningRoom({data:{
            deploymentId:available.deploymentId,courseVersionId:available.courseVersionId,
            siteId:available.siteId,
          }});
          setCode({roomId:created.facilitatedSessionId,
            code:created.pairingCode,expiresAt:created.pairingExpiresAt});
          setExpandedRoomId(created.facilitatedSessionId);
        })}>Start facilitator room</Button>
      </div>
      {!data.choices.length&&<WorkspaceNotice tone="attention" className="mt-4">
        <p>No published Course with an active learner attempt is authorized for
          delivery at this Site. A Site administrator must confirm the active
          deployment, Course publication and current participation.</p>
        <p className="mt-2">This learning room is separate from physical room coverage,
          staff presence, verified attendance and student release. None of those
          safeguards may be inferred from enrollment or device pairing.</p>
      </WorkspaceNotice>}
    </section>
    <section className="mt-5 border border-border bg-card p-5" aria-label="Practice a course before opening a room">
      <h2 className="font-serif text-xl font-semibold">Facilitator rehearsal</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Preview an approved course before any learner joins. Rehearsal uses
        its own rights-checked media and never creates a fake enrollment,
        pairing, attendance, learner work or course completion.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Label className="min-w-72 flex-1 text-sm font-medium">
          Approved Site course
          <Select className="mt-2"
            value={rehearsalChoice}
            onChange={e=>{setRehearsalChoice(e.target.value);setRehearsalScope(null);}}>
            <option value="">Choose a course to rehearse</option>
            {visibleRehearsalChoices.map(choice=><option
              key={choice.deploymentId+":"+choice.adoptionId+":"+choice.courseVersionId+":"+choice.siteId}
              value={choice.deploymentId+":"+choice.adoptionId+":"+choice.courseVersionId+":"+choice.siteId}>
              {choice.deploymentName} · {choice.courseTitle} · Site {choice.siteId.slice(0,8)}
            </option>)}
          </Select>
        </Label>
        <Button type="button" variant="outline" disabled={!rehearsal}
          onClick={()=>{if(rehearsal)setRehearsalScope({
            deploymentId:rehearsal.deploymentId,adoptionId:rehearsal.adoptionId,
            courseVersionId:rehearsal.courseVersionId,siteId:rehearsal.siteId,
          });}}>Preview approved media</Button>
      </div>
      {rehearsalFailed&&<p role="alert" className="mt-3 text-sm text-destructive">
        Authorized preview courses could not be loaded.
      </p>}
      {rehearsalOptions?.partial&&<p role="status" className="mt-3 text-xs text-muted-foreground">
        The Site preview list is limited. Narrow the authorized deployment before rehearsing additional courses.
      </p>}
      {rehearsalScope&&(!preferredSiteId||rehearsalScope.siteId===preferredSiteId)&&
        <ClassroomRehearsalPlayer scope={rehearsalScope}
          onClose={()=>setRehearsalScope(null)}/>}
    </section>
    {/* Calendar planning may happen before the first learner registers.
        The live-room choices above intentionally require active attempts;
        the independently authorized rehearsal reader exposes approved Course
        adoption without inventing a learner or bypassing scheduling grants. */}
    {!rehearsalOptions&&!rehearsalFailed&&<p role="status"
      className="mt-4 text-sm text-muted-foreground">
      Checking approved Course options for scheduling…
    </p>}
    {rehearsalFailed&&<WorkspaceNotice tone="attention" className="mt-4">
      Class scheduling options could not be verified. No Course will be
      made available until the authorized catalog loads.
    </WorkspaceNotice>}
    <ClassroomSchedulePanel choices={visibleRehearsalChoices}
      onRoomStarted={value=>{
        setCode({roomId:value.roomId,code:value.pairingCode,expiresAt:value.pairingExpiresAt});
        setExpandedRoomId(value.roomId);
        void invalidateRouterAndCheck(router).catch(()=>setMessage(
          "The scheduled room started, but the room list could not be refreshed. Refresh this page before continuing."
        ));
      }}/>
    <MutationFeedback state={feedback} pendingMessage="Updating the room…" className="mt-4"/>
    {message&&<p role="alert" className="mt-4 border border-border p-4 text-sm">{message}</p>}
    {code && Date.parse(code.expiresAt) > clockMs &&
      visibleRooms.some(room => room.id === code.roomId &&
        effectiveRoomState(room, clockMs) === "live") &&
      <section className="mt-5 border border-border bg-card p-5" aria-label="Current device pairing code">
      <p className="text-sm font-semibold">Share this code or QR with authorized learners</p>
      <ClassroomConnectQr code={code.code} expiresAt={code.expiresAt}/>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <a href={`/classroom/${compactUuidUrlValue(code.roomId)}/presentation#pair=${code.code.replaceAll("-", "")}&expires=${encodeURIComponent(code.expiresAt)}`}
          target="_blank" rel="noopener noreferrer">
          Launch projector with joining QR
        </a>
      </Button>
      <p className="mt-3 text-sm text-muted-foreground">
        Codes are temporary and independently revalidated at pairing time.
        Device pairing is not a verified learner headcount or attendance record.
      </p>
    </section>}
    <section className="mt-7" aria-label="Facilitated rooms">
      <h2 className="font-serif text-xl font-semibold">Your rooms</h2>
      <div className="mt-3 grid gap-4">
        {visibleRooms.map(room => {
          const roomState = effectiveRoomState(room, clockMs);
          return <article key={room.id} className="border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {visibleChoices.find(choice=>
                  choice.deploymentId===room.deploymentId&&
                  choice.courseVersionId===room.courseVersionId)?.courseTitle??"Course room"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Started {new Date(room.startedAt).toLocaleString()}
              </p>
            </div>
            <StatusBadge tone={roomState==="live"?"success":roomState==="expired"?"attention":"neutral"}>
              {roomState==="ended"?"Ended":roomState==="expired"?"Expired":"Live"}
            </StatusBadge>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Learners with paired devices</dt>
              <dd className="mt-1 font-serif text-2xl font-semibold">{room.pairedLearners}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Latest playback control</dt>
              <dd className="mt-1 text-sm font-medium">
                {room.latestPlayback?.kind??"Not recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pairing window</dt>
              <dd className="mt-1 text-sm font-medium">
                {roomState==="live"?
                  (new Date(room.pairingExpiresAt)>new Date()?"Open":"Expired"):
                  "Closed"}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline"
              aria-expanded={expandedRoomId===room.id}
              aria-controls={`facilitated-room-workspace-${room.id}`}
              onClick={()=>setExpandedRoomId(current=>current===room.id?null:room.id)}>
              {expandedRoomId===room.id?"Hide room workspace":"Open room workspace"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Attendance, practice, surveys and playback load only for the room you open.
            </p>
          </div>
          <div id={`facilitated-room-workspace-${room.id}`} hidden={expandedRoomId!==room.id}>
            {expandedRoomId===room.id&&<>
              {roomState==="live"&&<ClassroomFacilitatorConsole facilitatedSessionId={room.id}/>}
              <ClassroomAttendancePanel facilitatedSessionId={room.id}/>
              <ClassroomAssistedActivityPanel facilitatedSessionId={room.id}/>
              <ClassroomSurveyManager facilitatedSessionId={room.id}/>
              {roomState==="live"&&<div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy}
                  onClick={()=>void run(async()=>{
                    const renewed=await renewFacilitatedLearningPairing({
                      data:{facilitatedSessionId:room.id},
                    });
                    setCode({roomId:room.id,code:renewed.pairingCode,
                      expiresAt:renewed.pairingExpiresAt});
                  },"New pairing code generated.")}>Generate new pairing code</Button>
                <Button type="button" size="sm" variant="destructive" disabled={busy}
                  onClick={()=>setEndingRoomId(room.id)}>End room</Button>
              </div>}
            </>}
          </div>
        </article>;
        })}
        {!visibleRooms.length&&<p className="border border-border p-5 text-sm text-muted-foreground">
          No facilitated learning rooms have been started under your current Site permissions.
        </p>}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Session and pairing records are participation evidence only. Actual recorded-media
        delivery remains subject to the published track's content-rights policy.
      </p>
    </section>
    <ActionDialog open={endingRoomId!==null} title="End facilitated room?"
      description="End live playback and new device pairing for this room. Existing recorded participation and any available correction window remain independent."
      confirmLabel="End room" destructive pending={feedback.pending}
      confirmDisabled={feedback.refreshFailed}
      onClose={()=>setEndingRoomId(null)}
      onConfirm={()=>{
        const id=endingRoomId;
        if(!id)return;
        void run(async()=>{
          await endFacilitatedLearningRoom({data:{facilitatedSessionId:id}});
          if(code?.roomId===id)setCode(null);
          setEndingRoomId(null);
        },"Room ended.");
      }}>
      {feedback.error&&!feedback.refreshFailed&&<p role="alert" className="text-sm text-destructive">{feedback.error}</p>}
    </ActionDialog>
  </WorkspaceShell>;
}
