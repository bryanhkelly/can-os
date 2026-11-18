import type { getGradebook } from "@/modules/learning/gradebook.functions";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";

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
  return <div className="space-y-3 text-sm">
    <p className="font-semibold">
      {cell.status === "returned" ? "Previous attempt score (awaiting revision)" : "Score"}: {cell.score ?? "—"} / {assessment.pointsPossible ?? "—"}
    </p>
    {assessment.rubric.map(criterion => <p key={criterion.id}>
      {criterion.label}: {cell.feedbackRubric.find(item => item.id === criterion.id)?.points ?? "—"} / {criterion.maxPoints}
    </p>)}
    <p className="whitespace-pre-wrap">{cell.feedbackComment || "No feedback comment recorded."}</p>
    {cell.status === "graded" && assessment.maxAttempts !== null && cell.attemptNumber >= assessment.maxAttempts
      ? <WorkspaceNotice tone="attention">The configured attempt limit has been reached. This submission cannot be returned for another attempt.</WorkspaceNotice>
      : cell.status === "graded" && <Button type="button" variant="outline" disabled={busy} onClick={onReturnForRevision}>
          Return for revision
        </Button>
  </div>;
}
