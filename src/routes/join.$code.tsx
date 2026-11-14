import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { displayClassroomCode } from "@/domain/classroom-connect";
import { getClassroomConnectCourseChoices } from "@/modules/learning/classroom-connect.functions";
import { pairWithFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";

export const Route = createFileRoute("/join/$code")({ component: JoinClassroomByCode });

function JoinClassroomByCode() {
  const { code } = Route.useParams();
  const normalized = useMemo(() => {
    try { return displayClassroomCode(code); } catch { return null; }
  }, [code]);
  const [paired, setPaired] = useState(false);
  const courses = useQuery({
    queryKey: ["classroom-connect-choices"],
    queryFn: () => getClassroomConnectCourseChoices(),
    enabled: !!normalized,
    retry: false,
  });
  const join = useMutation({
    mutationFn: (courseAttemptId: string) => pairWithFacilitatedRoom({
      data: { courseAttemptId, pairingCode: normalized! },
    }),
    onSuccess: () => setPaired(true),
  });
  return <WorkspaceShell width="reading" eyebrow="Classroom Connect"
    title={paired ? "Device paired" : "Join the facilitated classroom"}
    subtitle="Only an active learner in the matching approved course can pair.">
    {!normalized ? <div className="space-y-3">
      <p role="alert">That pairing code is not in the expected format.</p>
      <Button asChild variant="outline"><Link to="/join">Enter a different code</Link></Button>
    </div> : paired ? <div className="space-y-4">
      <p role="status">Your device is paired to the facilitator's room.</p>
      <p className="text-sm text-muted-foreground">
        Pairing does not mean you are marked present or have completed the course.
      </p>
      <Button asChild variant="outline"><Link to="/">Go to my workspace</Link></Button>
    </div> : <div className="space-y-4">
      <p className="font-mono text-2xl tracking-wider">{normalized}</p>
      {courses.isPending && <p role="status">Checking your eligible course registrations…</p>}
      {courses.isError && <div className="space-y-3">
        <p role="alert">Your course registrations could not be verified. Sign in as an enrolled learner or ask your site facilitator for assistance. This feature may not be enabled yet.</p>
        <Button asChild variant="outline"><Link to="/access" search={{ returnTo: "/join/" + code }}>Sign in</Link></Button>
      </div>}
      {courses.isSuccess && courses.data.choices.length === 0 && <p role="status">
        No active authorized course attempts are available to this signed-in learner.
        Ask the facilitator to confirm your registration.
      </p>}
      {courses.isSuccess && courses.data.choices.map(choice => <div key={choice.courseAttemptId}
        className="flex flex-wrap items-center justify-between gap-3 border border-border p-4">
        <span className="font-medium">{choice.courseTitle}</span>
        <Button disabled={join.isPending} onClick={() => join.mutate(choice.courseAttemptId)}>
          {join.isPending ? "Pairing…" : "Pair to this course"}
        </Button>
      </div>)}
      {join.isError && <p role="alert" className="text-sm text-destructive">
        Pairing was refused. Check the code, expiration, your enrollment and the facilitator's current room.
      </p>}
      <p className="text-sm text-muted-foreground">
        The pairing code does not prove your identity or attendance. Only CAN OS verifies the selected course registration.
      </p>
      <Button asChild variant="outline"><Link to="/join">Use another code</Link></Button>
    </div>}
  </WorkspaceShell>;
}
