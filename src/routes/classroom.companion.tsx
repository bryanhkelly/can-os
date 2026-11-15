import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { getLearnerFacilitatedRoom, leaveFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";

export const Route = createFileRoute("/classroom/companion")({
  validateSearch: (search: Record<string, unknown>) => ({
    courseAttemptId: typeof search.courseAttemptId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search.courseAttemptId)
      ? search.courseAttemptId : "",
  }),
  component: ClassroomCompanionPage,
});
type Rooms = Awaited<ReturnType<typeof getLearnerFacilitatedRoom>>;

function ClassroomCompanionPage() {
  const { courseAttemptId } = Route.useSearch();
  const [data, setData] = useState<Rooms | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!courseAttemptId) return;
    let active = true;
    const refresh = () => {
      void getLearnerFacilitatedRoom({ data: { courseAttemptId } })
        .then(result => { if (active) { setData(result); setError(""); } })
        .catch(() => { if (active) { setData(null); setError("Your course or room access could not be verified."); } });
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [courseAttemptId]);
  async function leave(facilitatedSessionId: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await leaveFacilitatedRoom({ data: { courseAttemptId, facilitatedSessionId } });
      setData(await getLearnerFacilitatedRoom({ data: { courseAttemptId } }));
    } catch { setError("Unable to leave the room. Please retry."); }
    finally { setBusy(false); }
  }
  return <WorkspaceShell width="reading" eyebrow="Classroom Connect"
    title="Learner companion" subtitle="Your device remains linked to your own verified course registration.">
    {!courseAttemptId && <p role="alert">Join with a current facilitator code first.</p>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {courseAttemptId && !data && !error && <p role="status">Checking your room connection…</p>}
    {data?.rooms.map(room => <section key={room.facilitatedSessionId}
      className="mt-4 border border-border bg-card p-5">
      <h2 className="font-serif text-lg font-semibold">Connected to facilitated learning</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {room.latestPlayback
          ? "Latest facilitator playback: " + room.latestPlayback.kind
          : "Waiting for the facilitator to start playback."}
      </p>
      <Button className="mt-4" type="button" variant="outline" disabled={busy}
        onClick={() => void leave(room.facilitatedSessionId)}>Leave room</Button>
    </section>)}
    {data && !data.rooms.length && <p role="status" className="mt-4">You are not paired to an active room.</p>}
    <p className="mt-5 text-xs text-muted-foreground">
      Device pairing and facilitator playback are observations only. They do not
      establish attendance, watched minutes, learning mastery or course completion.
    </p>
    <a href="/join" className="mt-4 inline-block text-sm underline">Join another room</a>
  </WorkspaceShell>;
}
