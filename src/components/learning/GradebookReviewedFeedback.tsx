import type { getGradebook } from "@/modules/learning/gradebook.functions";

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
      ? <p className="text-sm">The configured attempt limit has been reached. This submission cannot be returned for another attempt.</p>
      : cell.status === "graded" && <button type="button" disabled={busy} onClick={onReturnForRevision}
          className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">Return for revision</button>}
  </div>;
}
