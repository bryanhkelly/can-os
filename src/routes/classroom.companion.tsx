import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { getLearnerFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";

export const Route = createFileRoute("/classroom/companion")({
  validateSearch: (search: Record<string, unknown>) => ({
    courseAttemptId: typeof search.courseAttemptId === "string" &&
      /^[0-9a-f-]{36}$/i.test(search.courseAttemptId) ? search.courseAttemptId : "",
  }),
  component: ClassroomCompanion,
});
function ClassroomCompanion() {
  const { courseAttemptId } = Route.useSearch();
  const room = useQuery({
    queryKey: ["classroom-companion", courseAttemptId],
    queryFn: () => getLearnerFacilitatedRoom({ data: { courseAttemptId } }),
    enabled: !!courseAttemptId,
    refetchInterval: 15000,
    staleTime: 0, gcTime: 0, retry: false,
  });
  return <WorkspaceShell width="reading" eyebrow="Classroom Connect"
    title="Learner companion" subtitle="Your personal device follows the facilitated course.">
    {!courseAttemptId && <p role="alert">Open a current room code to join your class.</p>}
    {room.isPending && courseAttemptId && <p role="status">Loading your classroom connection…</p>}
    {room.isError && <p role="alert">Your classroom session is unavailable. Sign in or contact your facilitator.</p>}
    {room.data?.rooms.length ? room.data.rooms.map(item=><section key={item.facilitatedSessionId}
      className="mt-4 border border-border bg-card p-4">
      <h2 className="font-medium">Connected to facilitated learning</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {item.latestPlayback ? "Last facilitator playback: " + item.latestPlayback.kind :
          "The facilitator has not started a recording."}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Device pairing is not proof of attendance, media viewing or course completion.
      </p>
    </section>) : room.isSuccess && <p role="status">You are not currently paired to an active room.</p>}
    <div className="mt-4 flex gap-2">
      <Button asChild variant="outline"><Link to="/join">Join another room</Link></Button>
    </div>
  </WorkspaceShell>;
}
