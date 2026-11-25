import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, MutationFeedback, QueryState, StatCard, WorkspaceNotice } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { ClassroomPlaybackControls } from "@/components/learning/ClassroomPlaybackControls";
import { getClassroomProjectorCommand } from "@/modules/learning/classroom-projector.functions";
import {
  getClassroomHostActivity, releaseClassroomActivity, closeClassroomActivity,
} from "@/modules/learning/classroom-evidence.functions";

/**
 * Private facilitator controls use the V6.1 right-angle UI. Never render these
 * response aggregates, roster/attendance, or session administration on the
 * audience-facing projector.
 */
export function ClassroomFacilitatorConsole({
  facilitatedSessionId, preferredLessonIds = [],
}: { facilitatedSessionId: string; preferredLessonIds?: readonly string[] }) {
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"single_choice" | "text">("single_choice");
  const [choicesText, setChoicesText] = useState("Yes\nNo");
  const [failedCommands,setFailedCommands]=useState(0);
  const [lastLocalCommand,setLastLocalCommand]=useState("");
  // Preserve one request identity across uncertain network failures.
  // A new prompt/options payload receives its own activity identity.
  const activityRequests = useRef(new Map<string, string>());
  const room = useQuery({
    queryKey: ["classroom-host-activities", facilitatedSessionId],
    queryFn: () => getClassroomHostActivity({ data: { facilitatedSessionId } }),
    staleTime: 0, refetchInterval: 8000, retry: false,
  });
  const projector=useQuery({
    queryKey:["classroom-projector-control",facilitatedSessionId],
    queryFn:()=>getClassroomProjectorCommand({data:{facilitatedSessionId}}),
    staleTime:0,refetchInterval:8000,retry:false,
  });
  const feedback = useMutationFeedback(() => room.refetch({throwOnError:true}));
  const busy = feedback.pending || feedback.refreshFailed;
  const currentState = room.data?.roomState ?? "unknown";
  const isLive = room.isSuccess && currentState === "live";

  async function run(action: () => Promise<void>) {
    if (busy) return;
    await feedback.run(action,{
      successMessage:"Classroom action saved.",
      commandErrorMessage:"The classroom action could not be confirmed. Check your current classroom permissions and retry with the same details.",
      refreshErrorMessage:"Classroom action saved, but the current room state could not be refreshed. Retry the refresh before taking another action.",
    });
  }

  const choices = kind === "single_choice"
    ? choicesText.split("\n").map(v => v.trim()).filter(Boolean) : [];
  const canRelease = prompt.trim().length >= 5 && prompt.trim().length <= 1000 &&
    (kind === "text" || (choices.length >= 2 && choices.length <= 8 &&
      choices.every(choice => choice.length <= 200)));

  return <section className="mt-4 space-y-4" aria-label="Private classroom facilitator console">
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div>
        <h4 className="font-serif text-xl font-semibold">Classroom controls</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          These tools are for an authorized Site facilitator, not for the projector screen.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/classroom/$sessionId/presentation" params={{ sessionId: facilitatedSessionId }} search={{layout:"presentation"}}>
          Open presentation screen
        </Link>
      </Button>
    </div>
    <QueryState loading={room.isPending&&"Checking Site and classroom authority…"} error={room.isError&&"Classroom controls are unavailable. Refresh after verifying the facilitator role."} onRetry={()=>void room.refetch()} retrying={room.isFetching}/>
    {room.isSuccess && room.data && <div className="grid gap-3 sm:grid-cols-2">
      <StatCard label="Registered learners with paired devices" value={room.data.pairedCount}/>
      <StatCard label="Recently active learner devices (estimate)" value={room.data.activeDevicesEstimate}/>
    </div>}
    <section className="border border-border bg-card p-4" aria-label="Classroom connection health">
      <h5 className="text-sm font-semibold">Classroom health</h5>
      <div className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
        <p><strong>Room:</strong> {room.isError?"Access not verified":room.isPending?"Checking…":currentState}</p>
        <p><strong>Latest check:</strong> {room.isError?"Failed":room.isFetching?"Refreshing…":
          room.dataUpdatedAt?new Date(room.dataUpdatedAt).toLocaleTimeString():"Not yet checked"}</p>
        <p><strong>Local projector errors:</strong> {failedCommands} (this open console)</p>
        <p><strong>Last local command:</strong> {lastLocalCommand||"None"}</p>
        <p><strong>Projector commands:</strong> {projector.isError?"Unavailable":
          projector.isPending?"Checking…":
          projector.data.roomState!=="live"?"Stopped ("+projector.data.roomState+")":
          projector.data.latest?"Last request: "+projector.data.latest.commandKind:
          "No commands yet"}</p>
        <p><strong>Activity:</strong> {room.isSuccess?
          room.data.releases.filter(release=>!release.closed).length+" open, "+
          room.data.releases.reduce((count,release)=>count+release.responseEvents,0)+" response events":
          "Unavailable"}</p>
      </div>
      {projector.isError&&<WorkspaceNotice tone="danger" className="mt-2">The latest projector command could not be verified. This is not a playback confirmation.</WorkspaceNotice>}
      {projector.isSuccess&&projector.data.roomState==="blocked"&&<WorkspaceNotice tone="danger" className="mt-2">Projector authorization is blocked. Recheck audience enrollment and recording rights.</WorkspaceNotice>}
      {room.isError&&<WorkspaceNotice tone="attention" className="mt-2">Current facilitator or room access cannot be verified. Do not rely on previous counts or command states.</WorkspaceNotice>}
      {room.isSuccess&&room.data.partial&&<WorkspaceNotice tone="attention" className="mt-2">Counts are partial because this room exceeds the bounded summary.</WorkspaceNotice>}
      <p className="mt-2 text-xs text-muted-foreground">
        Device activity is an estimate, not attendance, proof of watching, or delivery confirmation.
        Projector command acknowledgements are separate from confirmed playback observations.
      </p>
      <Button type="button" size="sm" variant="outline" className="mt-3"
        disabled={room.isFetching}
        onClick={()=>{void room.refetch();void projector.refetch();}}>Recheck classroom health</Button>
    </section>
    <p className="text-xs text-muted-foreground">
      Paired devices and activity heartbeats are observational, never verified
      physical attendance, video consumption, academic grades or completion.
    </p>
    {isLive && <ClassroomPlaybackControls facilitatedSessionId={facilitatedSessionId}
      preferredLessonIds={preferredLessonIds}
      onCommandStatus={(status,kind)=>{
        setLastLocalCommand(kind+" "+(status==="accepted"?"accepted":"refused"));
        if(status==="failed")setFailedCommands(count=>count+1);
      }}/>}
    {room.isSuccess && room.data && !isLive && <WorkspaceNotice>This classroom is {currentState}. New prompts and playback controls are closed.</WorkspaceNotice>}
    {isLive && <section className="border border-border bg-card p-4" aria-label="Release an activity">
      <h5 className="font-semibold">Ask the room a question</h5>
      <p className="mt-1 text-xs text-muted-foreground">
        Learners respond privately on their own devices. Responses are formative.
      </p>
      <Field className="mt-3" label="Question or discussion prompt">
        <Textarea className="mt-1"
          rows={3} maxLength={1000} value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="What is one responsible way to use AI at work?"/>
      </Field>
      <Field className="mt-3" label="Response format">
        <Select className="mt-1"
          value={kind} onChange={e => setKind(e.target.value as "single_choice" | "text")}>
          <option value="single_choice">Multiple choice</option>
          <option value="text">Short written response</option>
        </Select>
      </Field>
      {kind === "single_choice" && <Field className="mt-3" label="Options, one per line (2–8)">
        <Textarea className="mt-1"
          rows={4} maxLength={1600} value={choicesText}
          onChange={e => setChoicesText(e.target.value)}/>
      </Field>}
      <Button className="mt-3" type="button" disabled={busy || !canRelease}
        onClick={() => void run(async () => {
          const normalizedPrompt = prompt.trim();
          const requestKey = JSON.stringify([facilitatedSessionId, normalizedPrompt, kind, choices]);
          const requestId = activityRequests.current.get(requestKey) ?? crypto.randomUUID();
          activityRequests.current.set(requestKey, requestId);
          await releaseClassroomActivity({ data: {
            facilitatedSessionId, requestId, lessonId: null,
            prompt: normalizedPrompt, answerType: kind, choices,
          } });
          activityRequests.current.delete(requestKey);
          setPrompt("");
        })}>
        {busy ? "Saving…" : "Release to learners"}
      </Button>
    </section>}
    {room.isSuccess && room.data && <section className="border border-border bg-card p-4" aria-label="Classroom activity results">
      <h5 className="font-semibold">Released activities</h5>
      {!room.data.releases.length && <EmptyState className="mt-2" title="No classroom activities have been released."/>}
      {room.data.releases.map(activity => <article key={activity.id}
        className="mt-3 border-t border-border pt-3">
        <p className="font-medium">{activity.prompt}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {activity.closed ? "Closed" : "Accepting responses"}
          {" · "}{activity.respondingLearners} responding learners
          {" · "}{activity.responseEvents} submissions
        </p>
        {activity.answerType === "single_choice" && <div className="mt-2 space-y-1">
          {activity.choices.map((choice, i) => <p key={i} className="text-sm text-muted-foreground">
            {choice}: {activity.choiceCounts[i] ?? 0}
          </p>)}
        </div>}
        {!activity.closed && isLive && <Button type="button" size="sm"
          variant="outline" className="mt-3" disabled={busy}
          onClick={() => void run(async () => {
            await closeClassroomActivity({ data: {
              facilitatedSessionId, activityReleaseId: activity.id,
            } });
          })}>Close responses</Button>}
      </article>)}
    </section>}
    <MutationFeedback state={feedback} pendingMessage="Saving classroom action…" className="mt-3"/>
  </section>;
}
