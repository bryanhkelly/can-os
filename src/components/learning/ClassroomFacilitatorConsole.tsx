import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ClassroomPlaybackControls } from "@/components/learning/ClassroomPlaybackControls";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const room = useQuery({
    queryKey: ["classroom-host-activities", facilitatedSessionId],
    queryFn: () => getClassroomHostActivity({ data: { facilitatedSessionId } }),
    staleTime: 0, refetchInterval: 8000, retry: false,
  });
  const currentState = room.data?.roomState ?? "unknown";
  const isLive = room.isSuccess && currentState === "live";

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await action();
      await room.refetch();
      setNotice("Classroom action saved.");
    } catch {
      setError("The classroom action was not saved. Check current Site, room and course authority.");
    } finally { setBusy(false); }
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
        <Link to="/classroom/$sessionId/presentation" params={{ sessionId: facilitatedSessionId }}>
          Open presentation screen
        </Link>
      </Button>
    </div>
    {room.isPending && <p role="status">Checking Site and classroom authority…</p>}
    {room.isError && <p role="alert" className="text-sm text-destructive">
      Classroom controls are unavailable. Refresh after verifying the facilitator role.
    </p>}
    {room.isSuccess && room.data && <div className="grid gap-3 sm:grid-cols-2">
      <div className="border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">Registered learners with paired devices</p>
        <p className="mt-2 font-serif text-2xl font-semibold tabular-nums">{room.data.pairedCount}</p>
      </div>
      <div className="border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">Recently active learner devices (estimate)</p>
        <p className="mt-2 font-serif text-2xl font-semibold tabular-nums">{room.data.activeDevicesEstimate}</p>
      </div>
    </div>}
    {room.isSuccess && room.data?.partial && <p role="status" className="text-xs text-muted-foreground">
      This room exceeded the bounded live summary. The counts shown are partial.
    </p>}
    <p className="text-xs text-muted-foreground">
      Paired devices and activity heartbeats are observational, never verified
      physical attendance, video consumption, academic grades or completion.
    </p>
    {isLive && <ClassroomPlaybackControls facilitatedSessionId={facilitatedSessionId}
      preferredLessonIds={preferredLessonIds}/>}
    {room.isSuccess && room.data && !isLive && <p role="status" className="border border-border p-4 text-sm">
      This classroom is {currentState}. New prompts and playback controls are closed.
    </p>}
    {isLive && <section className="border border-border bg-card p-4" aria-label="Release an activity">
      <h5 className="font-semibold">Ask the room a question</h5>
      <p className="mt-1 text-xs text-muted-foreground">
        Learners respond privately on their own devices. Responses are formative.
      </p>
      <label className="mt-3 block text-sm font-medium">
        Question or discussion prompt
        <textarea className="mt-1 w-full border border-border bg-background p-3"
          rows={3} maxLength={1000} value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="What is one responsible way to use AI at work?"/>
      </label>
      <label className="mt-3 block text-sm font-medium">
        Response format
        <select className="mt-1 min-h-10 w-full border border-border bg-background p-2"
          value={kind} onChange={e => setKind(e.target.value as "single_choice" | "text")}>
          <option value="single_choice">Multiple choice</option>
          <option value="text">Short written response</option>
        </select>
      </label>
      {kind === "single_choice" && <label className="mt-3 block text-sm font-medium">
        Options, one per line (2–8)
        <textarea className="mt-1 w-full border border-border bg-background p-3"
          rows={4} maxLength={1600} value={choicesText}
          onChange={e => setChoicesText(e.target.value)}/>
      </label>}
      <Button className="mt-3" type="button" disabled={busy || !canRelease}
        onClick={() => void run(async () => {
          await releaseClassroomActivity({ data: {
            facilitatedSessionId, requestId: crypto.randomUUID(), lessonId: null,
            prompt: prompt.trim(), answerType: kind, choices,
          } });
          setPrompt("");
        })}>
        {busy ? "Saving…" : "Release to learners"}
      </Button>
    </section>}
    {room.isSuccess && room.data && <section className="border border-border bg-card p-4" aria-label="Classroom activity results">
      <h5 className="font-semibold">Released activities</h5>
      {!room.data.releases.length && <p className="mt-2 text-sm text-muted-foreground">
        No classroom activities have been released.
      </p>}
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
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </section>;
}
