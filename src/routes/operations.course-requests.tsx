import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { decideCourseChange } from "@/modules/learning/course-registration.functions";
import { listRegistrarCourseRequests } from "@/modules/learning/registrar-course-requests.functions";

export const Route = createFileRoute("/operations/course-requests")({
  loader: safeLoader(() => listRegistrarCourseRequests(), {
    authMessage: "Sign in as an authorized registrar to review course changes.",
  }),
  component: RegistrarCourseRequests,
});

function RegistrarCourseRequests() {
  const result = Route.useLoaderData();
  if (!result.ok) {
    return <LoaderFailure eyebrow="Registration" title="Course change requests" outcome={result} />;
  }
  return <CourseRequestList requests={result.data} />;
}

type CourseRequest = Awaited<ReturnType<typeof listRegistrarCourseRequests>>[number];
function CourseRequestList({ requests }: { requests: CourseRequest[] }) {
  const router = useRouter();
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const selection=Route.useSearch();
  const visibleRequests=requests.filter(request=>
    (!selection.siteId||request.siteId===selection.siteId)&&
    (!selection.programId||request.programId===selection.programId));
  async function decide(requestId: string, approve: boolean) {
    await mutation.run(
      () => decideCourseChange({ data: { requestId, approve } }),
      {
        successMessage: approve ? "Enrollment change approved and recorded." : "Course request declined.",
        commandErrorMessage: "Unable to complete registration decision.",
      },
    );
  }

  return (
    <WorkspaceShell
      eyebrow="Academic operations"
      title="Course change approvals"
      subtitle="Approve or decline pending student course changes. Enrollment guards and any required guardian permission are verified again when you approve."
      actions={<div className="flex flex-wrap gap-2">
        <Link to="/operations/course-policies" search={{siteId:selection.siteId,programId:selection.programId}} className="rounded-lg border px-3 py-2 text-sm">
          Registration policies
        </Link>
        <Link to="/operations/field-trips" search={{siteId:undefined,programId:undefined}} className="rounded-lg border px-3 py-2 text-sm">Field trips</Link>
        <Link to="/home" search={{siteId:selection.siteId,programId:selection.programId}} className="rounded-lg border px-3 py-2 text-sm">Operations</Link>
      </div>}
    >
      <MutationFeedback state={mutation} className="mt-5" pendingMessage="Saving course decision..."/>
      <div className="mt-7 space-y-4">
        {visibleRequests.map(request => (
          <article key={request.id} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {request.studentName} · {request.sectionCode}
                </p>
                <h2 className="mt-2 text-lg font-semibold">{request.sectionTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {request.operation === "add" ? "Add class" : request.operation === "drop" ? "Drop class" : "Withdraw from class"}
                  {" · "}Requested {new Date(request.createdAt).toLocaleDateString()}
                  {" · "}Deadline {request.deadline}
                </p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs">
                {request.guardianState === "approved" ? "Guardian approved" :
                  request.guardianState === "declined" ? "Guardian declined" :
                  request.guardianState === "pending" ? "Awaiting guardian approval" : "No guardian approval required"}
              </span>
            </div>
            {!request.programActive && (
              <p className="mt-3 text-sm text-amber-700">The student's program enrollment is no longer active.</p>
            )}
            {request.deadlinePassed && (
              <p className="mt-3 text-sm text-amber-700">The registration deadline has passed.</p>
            )}
            {request.operation === "add" && !request.contentReady && <div className="mt-3 rounded-lg border p-3 text-sm">
              <p className="font-semibold">Next: school curriculum setup</p>
              <p>The school's authorized curriculum publisher must provide a published release with at least one student-accessible lesson.
                The registrar must then use that release for this class. Publishing a newer release alone does not update the class's pinned version.</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link to="/operations/curriculum" search={{ programId: request.programId }} className="font-semibold underline">Review curriculum releases</Link>
                <Link to="/operations/launch/$programId" params={{ programId: request.programId }} className="font-semibold underline">Review class setup</Link>
              </div>
            </div>}
            <p className="mt-3 text-sm text-muted-foreground">
              {!request.programActive ? "Next: registrar reviews the student's Program enrollment." :
                request.deadlinePassed ? "Next: registrar reviews the expired request; approval is unavailable under the current deadline." :
                request.operation === "add" && !request.contentReady ? "Approval is blocked until school content is ready." :
                request.guardianState === "pending" ? "Next: an authorized guardian reviews permission in Family course approvals, then the registrar decides." :
                request.guardianState === "declined" ? "Guardian permission was declined. The registrar can decline this request; enrollment is unchanged." :
                "Next: registrar reviews this request. Approval rechecks staffing, capacity, prerequisites, credits and schedule; this is not a readiness certificate."}
            </p>
            <div className="mt-4 flex gap-3">
              <button type="button" disabled={busy}
                onClick={() => void decide(request.id, false)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
                Decline
              </button>
              <button type="button" disabled={busy || !request.canApprove}
                onClick={() => void decide(request.id, true)}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
                Approve change
              </button>
            </div>
          </article>
        ))}
        {visibleRequests.length === 0 &&
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No pending course change requests in your authorized schools and programs.
          </p>}
      </div>
    </WorkspaceShell>
  );
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
