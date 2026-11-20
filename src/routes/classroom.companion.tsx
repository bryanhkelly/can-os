import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { ClassroomCompanionRoom } from "@/components/learning/ClassroomCompanionRoom";
import { ClassroomFeedbackPanel } from "@/components/learning/ClassroomFeedbackPanel";
import { ClassroomConnectionStatus } from "@/components/learning/ClassroomConnectionStatus";
import { useLearnerClassroomRooms } from "@/components/learning/useLearnerClassroomRooms";
import { leaveFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";

export const Route = createFileRoute("/classroom/companion")({
  validateSearch: (search: Record<string, unknown>) => ({
    courseAttemptId: typeof search.courseAttemptId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search.courseAttemptId)
      ? search.courseAttemptId : "",
  }),
  component: ClassroomCompanionPage,
});

/** Legacy non-native Course attempts share the exact same room and feedback readers
 * as native Classes; this route never constructs a parallel learner identity. */
function ClassroomCompanionPage() {
  const { courseAttemptId } = Route.useSearch();
  const rooms = useLearnerClassroomRooms(courseAttemptId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function leave(facilitatedSessionId: string) {
    if (busy || !courseAttemptId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await leaveFacilitatedRoom({ data: { courseAttemptId, facilitatedSessionId } });
      setNotice("You left the room. Previously recorded responses remain intact.");
      void rooms.refetch();
    } catch {
      setError("Leaving the room could not be confirmed. Retry after rechecking your connection.");
    } finally { setBusy(false); }
  }
  return <WorkspaceShell width="reading" eyebrow="Classroom Connect"
    title="Learner companion" subtitle="Your device remains linked to your verified Course registration.">
    {!courseAttemptId && <p role="alert">Join with a current facilitator code first.</p>}
    {courseAttemptId && <ClassroomConnectionStatus rooms={rooms}/>}
    {rooms.isError && <p role="alert" className="mt-4 text-sm text-destructive">
      Classroom access could not be verified. Room controls are unavailable.
      <Button variant="outline" size="sm" className="ml-2"
        onClick={() => void rooms.refetch()}>Retry</Button>
    </p>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm">{notice}</p>}
    {rooms.isSuccess && rooms.data.rooms.map(room => <section
      key={room.facilitatedSessionId} className="mt-4 border border-border bg-card p-5">
      <h2 className="font-serif text-lg font-semibold">Connected to facilitated learning</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {room.latestPlayback ? "Latest facilitator playback: " + room.latestPlayback.kind
          : "Waiting for the facilitator to start playback."}
      </p>
      <ClassroomCompanionRoom courseAttemptId={courseAttemptId}
        facilitatedSessionId={room.facilitatedSessionId}/>
      <Button className="mt-4" type="button" variant="outline" disabled={busy}
        onClick={() => void leave(room.facilitatedSessionId)}>Leave room</Button>
    </section>)}
    {rooms.isSuccess && !rooms.data.rooms.length && <p role="status" className="mt-4">
      No active room connection. You may still rate an eligible recent session below.
    </p>}
    {courseAttemptId && <div className="mt-5">
      <ClassroomFeedbackPanel courseAttemptId={courseAttemptId}/>
    </div>}
    <p className="mt-5 text-xs text-muted-foreground">
      Pairing, playback and device heartbeats are observational. They do not
      establish verified attendance, watched minutes, learning mastery or completion.
    </p>
    <Link to="/join" className="mt-4 inline-block text-sm underline">Join another room</Link>
  </WorkspaceShell>;
}
