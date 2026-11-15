import { useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { displayClassroomCode } from "@/domain/classroom-connect";
import { getClassroomConnectCourseChoices } from "@/modules/learning/classroom-connect.functions";
import { pairWithFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";

export const Route = createFileRoute("/join/$code")({
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  component: JoinClassroomByCode,
});

function JoinClassroomByCode() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const normalized = useMemo(() => {
    try { return displayClassroomCode(code); } catch { return null; }
  }, [code]);
  const courses = useQuery({
    queryKey: ["classroom-connect-choices", normalized],
    queryFn: () => getClassroomConnectCourseChoices(),
    enabled: !!normalized,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const join = useMutation({
    mutationFn: (courseAttemptId: string) => pairWithFacilitatedRoom({
      data: { courseAttemptId, pairingCode: normalized! },
    }),
    onSuccess: (_, courseAttemptId) => {
      // Replace the route after success: do not leave a pairing secret in tab history.
      void navigate({ to: "/classroom/companion",
        search: { courseAttemptId }, replace: true });
    },
  });
  useEffect(() => { join.reset(); }, [code]);

  return <WorkspaceShell width="reading" eyebrow="Classroom Connect"
    title="Join the facilitated classroom"
    subtitle="Only an active learner in the matching approved course can pair.">
    {!normalized ? <div className="space-y-3">
      <p role="alert">That pairing code is not in the expected format.</p>
      <Button asChild variant="outline"><Link to="/join">Enter a different code</Link></Button>
    </div> : <div className="space-y-4">
      <p className="font-mono text-2xl tracking-wider">{normalized}</p>
      {courses.isPending && <p role="status">Checking your eligible course registrations…</p>}
      {courses.isError && <div className="space-y-3">
        <p role="alert">Registrations could not be verified. Sign in as an enrolled learner or ask your facilitator for assistance. This feature may not be enabled yet.</p>
        <Button asChild variant="outline"><Link to="/access"
          search={{ returnTo: "/join/" + code }}>Sign in</Link></Button>
      </div>}
      {courses.isSuccess && courses.data.choices.length === 0 && <p role="status">
        No active authorized course attempts are available to this signed-in learner.
        Ask your facilitator to confirm your enrollment and Site placement.
      </p>}
      {courses.isSuccess && courses.data.choices.map(choice => <div key={choice.courseAttemptId}
        className="flex flex-wrap items-center justify-between gap-3 border border-border p-4">
        <span className="font-medium">{choice.courseTitle}</span>
        <Button disabled={join.isPending} onClick={() => join.mutate(choice.courseAttemptId)}>
          {join.isPending ? "Pairing…" : "Pair to this course"}
        </Button>
      </div>)}
      {join.isError && <p role="alert" className="text-sm text-destructive">
        Pairing was refused. Check the code, its expiry, your course and current Site assignment.
      </p>}
      <p className="text-sm text-muted-foreground">
        This code does not prove identity or attendance. CAN OS verifies registration at pairing time.
      </p>
      <Button asChild variant="outline"><Link to="/join">Use another code</Link></Button>
    </div>}
  </WorkspaceShell>;
}
