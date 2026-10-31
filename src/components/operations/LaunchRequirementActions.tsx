import { useState } from "react";
import type { LaunchGuidanceTask } from "@/domain/launch-guidance";

export function SchoolOwnedCompletion({ task, busy, complete }: {
  task: LaunchGuidanceTask;
  busy: boolean;
  complete: (requirementId: string) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  if (!task.requirementId || task.state !== "needs_you" || task.requiresRegistrarReview) return null;
  return <details className="mt-4 rounded-xl border bg-background p-4">
    <summary className="cursor-pointer text-sm font-semibold">Record this school-owned requirement</summary>
    <p className="mt-3 text-sm text-muted-foreground">
      Use this only after the actual work is complete. This cannot complete CAN or third-party work,
      approve evidence, or authorize opening.
    </p>
    <label className="mt-3 flex items-start gap-2 text-sm">
      <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
      I confirm the school-owned work is complete and accurately represented.
    </label>
    <button type="button" disabled={busy || !confirmed} onClick={() => void complete(task.requirementId!)}
      className="mt-3 min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">
      Save school completion
    </button>
  </details>;
}

export function LaunchEvidenceStatement({ task, busy, submit }: {
  task: LaunchGuidanceTask;
  busy: boolean;
  submit: (requirementId: string, statement: string) => Promise<boolean>;
}) {
  const [statement, setStatement] = useState("");
  if (!task.requirementId || !["needs_you", "needs_can"].includes(task.state) || task.pendingEvidenceReview || task.action === "admissions" || (task.state === "needs_you" && !task.evidenceReviewRequired)) return null;
  return <form className="mt-4 rounded-xl border bg-background p-4" onSubmit={event => {
    event.preventDefault();
    if (statement.trim().length < 10) return;
    void submit(task.requirementId!, statement.trim()).then(saved => { if (saved) setStatement(""); });
  }}>
    <p className="text-sm font-semibold">Submit evidence statement</p>
    <p className="mt-2 text-xs text-muted-foreground">Describe the completed work or supporting evidence. This records a statement for review; it does not approve the requirement or authorize opening.</p>
    <label className="mt-3 block text-sm">Evidence details
      <textarea value={statement} onChange={event => setStatement(event.target.value)} maxLength={4000}
        rows={3} className="mt-1 block w-full rounded-lg border bg-card p-2" />
    </label>
    <button type="submit" disabled={busy || statement.trim().length < 10}
      className="mt-3 min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">Record evidence statement</button>
  </form>;
}

export function InstitutionalEvidenceReview({ task, busy, review }: {
  task: LaunchGuidanceTask;
  busy: boolean;
  review: (id: string, decision: "accepted" | "rejected", reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"accepted" | "rejected">("rejected");
  if (!task.requirementId || !task.pendingEvidenceReview || task.state === "complete") return null;
  return <form className="mt-4 rounded-xl border bg-background p-4" onSubmit={event => {
    event.preventDefault();
    void review(task.requirementId!, decision, reason).then(saved => { if (saved) setReason(""); });
  }}>
    <p className="text-sm font-semibold">CAN institutional evidence review</p>
    <p className="mt-2 text-xs text-muted-foreground">Approval completes this requirement, but does not independently authorize opening.</p>
    {task.latestEvidenceStatement && <blockquote className="mt-3 whitespace-pre-wrap rounded-lg border p-3 text-sm">{task.latestEvidenceStatement}</blockquote>}
    {task.latestEvidenceStatementAt && <p className="mt-2 text-xs text-muted-foreground">Submitted: {task.latestEvidenceStatementAt}</p>}
    <label className="mt-3 block text-sm">Decision
      <select value={decision} onChange={event => setDecision(event.target.value as "accepted" | "rejected")}
        className="mt-1 block w-full rounded-lg border bg-card p-2">
        <option value="rejected">Request correction</option>
        <option value="accepted">Accept evidence</option>
      </select>
    </label>
    <label className="mt-3 block text-sm">Decision reason
      <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000}
        rows={3} className="mt-1 block w-full rounded-lg border bg-card p-2" />
    </label>
    <button type="submit" disabled={busy || (decision === "rejected" ? reason.trim().length < 5 : reason.trim().length < 1)}
      className="mt-3 min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">
      Record institutional decision
    </button>
  </form>;
}

