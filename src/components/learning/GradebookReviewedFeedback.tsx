import { useState } from "react";
import type { getGradebook } from "@/modules/learning/gradebook.functions";
import { Button } from "@/components/ui/button";
import { ActionDialog, WorkspaceNotice } from "@/components/workspace";

type Gradebook = Awaited<ReturnType<typeof getGradebook>>;
type Assessment = Gradebook["assessments"][number];
type Cell = Gradebook["cells"][number];

export function GradebookReviewedFeedback({
  cell, assessment, busy, onReturnForRevision,
}: {
  cell: Cell;
  assessment: Assessment;
  busy: boolean;
  onReturnForRevision: () => void;
}) {
  const [confirmRevision, setConfirmRevision] = useState(false);
  const attemptLimitReached = cell.status === "graded"
    && assessment.maxAttempts !== null
    && cell.attemptNumber >= assessment.maxAttempts;

  return <div className="space-y-3 text-sm">
    <p className="font-semibold">
      {cell.status === "returned" ? "Previous attempt score (awaiting revision)" : "Score"}: {cell.score ?? "—"} / {assessment.pointsPossible ?? "—"}
    </p>
    {assessment.rubric.map(criterion => <p key={criterion.id}>
      {criterion.label}: {cell.feedbackRubric.find(item => item.id === criterion.id)?.points ?? "—"} / {criterion.maxPoints}
    </p>)}
    <p className="whitespace-pre-wrap">{cell.feedbackComment || "No feedback comment recorded."}</p>
    {attemptLimitReached
      ? <WorkspaceNotice tone="attention">The configured attempt limit has been reached. This submission cannot be returned for another attempt.</WorkspaceNotice>
      : cell.status === "graded"
        ? <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmRevision(true)}>
            Return for revision
          </Button>
        : null}
    <ActionDialog open={confirmRevision} title="Return this submission for revision?"
      description="The existing grade remains in the student's grading history. The student can revise and resubmit subject to the configured attempt limit."
      confirmLabel="Return for revision" pending={busy} confirmDisabled={busy}
      onClose={() => setConfirmRevision(false)}
      onConfirm={() => { setConfirmRevision(false); onReturnForRevision(); }}/>
  </div>;
}
