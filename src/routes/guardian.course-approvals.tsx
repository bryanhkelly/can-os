import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import {
  listGuardianCourseApprovals, decideGuardianCourseApproval,
} from "@/modules/learning/guardian-course-approval.functions";

export const Route = createFileRoute("/guardian/course-approvals")({
  loader: safeLoader(() => listGuardianCourseApprovals(), {
    authMessage: "Sign in with an authorized guardian account to review class approvals.",
  }),
  component: GuardianCourseApprovals,
});

function GuardianCourseApprovals() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) {
    return <LoaderFailure eyebrow="CAN OS · Family" title="Course approvals" outcome={outcome} />;
  }
  return <CourseApprovalList items={outcome.data} />;
}

type Approval = Awaited<ReturnType<typeof listGuardianCourseApprovals>>[number];

function CourseApprovalList({ items }: { items: Approval[] }) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function decide(requestId: string, approve: boolean) {
    setBusyId(requestId);
    setError("");
    setNotice("");
    try {
      await decideGuardianCourseApproval({
        data: { requestId, approve, acknowledge: approve && acknowledged[requestId] === true },
      });
      await router.invalidate();
      setNotice(approve ? "Your approval was recorded." : "Your decision to decline was recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save your decision.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Family"
      title="Course approvals"
      subtitle="Review student requests to add classes that require your permission. Your decision is recorded with the request for the school registrar."
      actions={<div className="flex flex-wrap gap-2">
        <Link to="/guardian/group-permissions" className="rounded-lg border px-3 py-2 text-sm">Group permissions</Link>
        <Link to="/guardian/field-trips" className="rounded-lg border px-3 py-2 text-sm">Field trip permissions</Link>
        <Link to="/guardian/" className="rounded-lg border px-3 py-2 text-sm">Family home</Link>
      </div>}
    >
      {notice && <p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
      <div className="mt-7 space-y-4">
        {items.map(item => (
          <article key={item.id} className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {item.studentName} · {item.sectionCode}
            </p>
            <h2 className="mt-2 text-lg font-semibold">{item.sectionTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Registration deadline: {item.deadline}. Your response does not enroll the student automatically;
              the registrar must still approve the schedule change.
            </p>
            {item.myDecision &&
              <p className="mt-3 text-sm font-medium">
                Your current decision: {item.myDecision === "approve" ? "Approved" : "Declined"}.
                You can change it while this request remains pending.
              </p>}
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={acknowledged[item.id] ?? false}
                onChange={event => setAcknowledged(previous => ({
                  ...previous, [item.id]: event.target.checked,
                }))}
                className="mt-1"
              />
              <span>I understand that I am authorizing this class addition for {item.studentName},
                subject to final school approval and the published registration policy.</span>
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!!busyId || !acknowledged[item.id]}
                onClick={() => void decide(item.id, true)}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
              >
                Approve class addition
              </button>
              <button
                type="button"
                disabled={!!busyId}
                onClick={() => void decide(item.id, false)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </article>
        ))}
        {items.length === 0 &&
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            There are no pending course requests that need your approval.
          </p>}
      </div>
    </WorkspaceShell>
  );
}
