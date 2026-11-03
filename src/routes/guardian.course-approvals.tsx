import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import {
  listGuardianCourseApprovals, decideGuardianCourseApproval,
} from "@/modules/learning/guardian-course-approval.functions";

export const Route = createFileRoute("/guardian/course-approvals")({
  validateSearch: (search: Record<string, unknown>): { action?: string } => ({
    action: typeof search.action === "string" ? search.action : undefined,
  }),
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
  const { action } = Route.useSearch();
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;

  async function decide(requestId: string, approve: boolean) {
    await mutation.run(
      () => decideGuardianCourseApproval({
        data: { requestId, approve, acknowledge: approve && acknowledged[requestId] === true },
      }),
      {
        successMessage: approve ? "Your approval was recorded. The registrar must still finalize the schedule." : "Your decision to decline was recorded.",
        commandErrorMessage: "Unable to save your decision.",
      },
    );
  }

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Family"
      title="Course approvals"
      subtitle="Review student requests to add classes that require your permission. Your decision is recorded with the request for the school registrar."
      actions={<div className="flex flex-wrap gap-2">
        <Link to="/guardian/group-permissions" className="rounded-lg border px-3 py-2 text-sm">Group permissions</Link>
        <Link to="/guardian/field-trips" className="rounded-lg border px-3 py-2 text-sm">Field trip permissions</Link>
        <Link to="/guardian" className="rounded-lg border px-3 py-2 text-sm">Family home</Link>
      </div>}
    >
      <MutationFeedback state={mutation} className="mt-5" pendingMessage="Saving your course decision..." />
      {action && <Link to="/guardian/course-approvals" className="mt-5 inline-block text-sm underline">View all course approvals</Link>}
      {action && !items.some(item=>item.id===action) &&
        <p role="alert" className="mt-5 rounded-lg border p-4 text-sm">This request is unavailable in your authorized course approvals.</p>}
      <div className="mt-7 space-y-4">
        {items.filter(item=>!action||item.id===action).map(item => (
          <article key={item.id} className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {item.studentName} · {item.sectionCode}
            </p>
            <h2 className="mt-2 text-lg font-semibold">{item.sectionTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Registration deadline: {item.deadline}. Your response does not enroll the student automatically;
              the registrar must still approve the schedule change.
            </p>
            {!item.contentReady && <p className="mt-3 rounded-lg border p-3 text-sm">
              School content setup is pending. The school must provide published student-accessible lessons for this class before enrollment can be approved.
              You may record your permission now; it does not reserve a seat or complete enrollment.
            </p>}
            <p className="mt-3 text-sm">
              {item.myDecision === "approve" ? "Next: the school registrar reviews the request after any school setup blockers are resolved." :
                item.myDecision === "decline" ? "Next: the registrar reviews your declined permission. The student has not been enrolled by this request." :
                "Next: review the class request and record your permission decision. The registrar makes the final enrollment decision."}
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
                disabled={busy || !acknowledged[item.id]}
                onClick={() => void decide(item.id, true)}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
              >
                Approve class addition
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide(item.id, false)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </article>
        ))}
        {items.length === 0 && !action &&
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            There are no pending course requests that need your approval.
          </p>}
      </div>
    </WorkspaceShell>
  );
}
