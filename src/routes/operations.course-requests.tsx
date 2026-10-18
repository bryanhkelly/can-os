import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
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
    return <LoaderFailure eyebrow="CAN OS · Registration" title="Course change requests" outcome={result} />;
  }
  return <CourseRequestList requests={result.data} />;
}

type CourseRequest = Awaited<ReturnType<typeof listRegistrarCourseRequests>>[number];
function CourseRequestList({ requests }: { requests: CourseRequest[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function decide(requestId: string, approve: boolean) {
    setBusyId(requestId);
    setError("");
    setNotice("");
    try {
      await decideCourseChange({ data: { requestId, approve } });
      await router.invalidate();
      setNotice(approve ? "Enrollment change approved and recorded." : "Course request declined.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete registration decision.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Academic operations"
      title="Course change approvals"
      subtitle="Approve or decline pending student course changes. Enrollment guards and any required guardian permission are verified again when you approve."
      actions={<div className="flex flex-wrap gap-2">
        <Link to="/operations/course-policies" search={{siteId:undefined,programId:undefined}} className="rounded-lg border px-3 py-2 text-sm">
          Registration policies
        </Link>
        <Link to="/operations/field-trips" search={{siteId:undefined,programId:undefined}} className="rounded-lg border px-3 py-2 text-sm">Field trips</Link>
        <Link to="/operations" search={{siteId:undefined,programId:undefined}} className="rounded-lg border px-3 py-2 text-sm">Operations</Link>
      </div>}
    >
      {notice && <p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
      <div className="mt-7 space-y-4">
        {requests.map(request => (
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
            <div className="mt-4 flex gap-3">
              <button type="button" disabled={!!busyId}
                onClick={() => void decide(request.id, false)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
                Decline
              </button>
              <button type="button" disabled={!!busyId || !request.canApprove}
                onClick={() => void decide(request.id, true)}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
                Approve change
              </button>
            </div>
          </article>
        ))}
        {requests.length === 0 &&
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No pending course change requests in your authorized schools and programs.
          </p>}
      </div>
    </WorkspaceShell>
  );
}
