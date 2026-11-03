import { useState } from "react";
import type { LaunchGuidanceTask } from "@/domain/launch-guidance";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
    <Label className="mt-3 flex items-start gap-2 text-sm">
      <Checkbox checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
      I confirm the school-owned work is complete and accurately represented.
    </Label>
    <Button type="button" variant="outline" disabled={busy || !confirmed} onClick={() => void complete(task.requirementId!)}
      className="mt-3">
      Save school completion
    </Button>
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
    <Field label="Evidence details" className="mt-3">
      <Textarea value={statement} onChange={event => setStatement(event.target.value)} maxLength={4000} rows={3} />
    </Field>
    <Button type="submit" variant="outline" disabled={busy || statement.trim().length < 10}
      className="mt-3">Record evidence statement</Button>
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
    <Field label="Decision" className="mt-3">
      <Select value={decision} onChange={event => setDecision(event.target.value as "accepted" | "rejected")}>
        <option value="rejected">Request correction</option>
        <option value="accepted">Accept evidence</option>
      </Select>
    </Field>
    <Field label="Decision reason" className="mt-3">
      <Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={3} />
    </Field>
    <Button type="submit" variant="outline" disabled={busy || (decision === "rejected" ? reason.trim().length < 5 : reason.trim().length < 1)}
      className="mt-3">
      Record institutional decision
    </Button>
  </form>;
}
