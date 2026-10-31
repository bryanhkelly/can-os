import { AssessmentDraftEditor } from "@/components/learning/AssessmentDraftEditor";
import { AssessmentScheduleEditor } from "@/components/learning/AssessmentScheduleEditor";
import type { getGradebook } from "@/modules/learning/gradebook.functions";

type Assessment = Awaited<ReturnType<typeof getGradebook>>["assessments"][number];
type Action = "publish" | "close" | "reopen" | "reschedule";

export function GradebookAssessmentHeader({
  assessment,
  busy,
  dueDate,
  onDueDateChange,
  onAction,
  onDraftSaved,
  onScheduleSaved,
}: {
  assessment: Assessment;
  busy: boolean;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  onAction: (action: Action) => void;
  onDraftSaved: () => Promise<void>;
  onScheduleSaved: () => Promise<unknown>;
}) {
  return (
    <th className="min-w-32 p-3 font-semibold">
      <span className="block">{assessment.title}</span>
      <span className="block text-xs font-normal text-muted-foreground">
        {assessment.dueAt ? `Due ${new Date(assessment.dueAt).toLocaleDateString()}` : "No due date"}
        {" · "}{assessment.pointsPossible ?? "—"} pts
        {assessment.rubric.length > 0 && ` · ${assessment.rubric.length} criteria`}
        {" · "}{assessment.kind}
        {" · "}{assessment.status}
        {assessment.maxAttempts !== null && " · " + assessment.maxAttempts + " maximum attempts"}
        {assessment.availableAt && " · Releases " + new Date(assessment.availableAt).toLocaleString()}
        {assessment.closesAt ? " · Closes " + new Date(assessment.closesAt).toLocaleString() : " · No submission close time"}
      </span>
      {assessment.status === "draft" && (
        <AssessmentDraftEditor
          key={assessment.id + assessment.title + assessment.instructions}
          assessment={assessment}
          onSaved={onDraftSaved}
        />
      )}
      {assessment.status !== "closed" && (
        <AssessmentScheduleEditor
          key={assessment.id + assessment.availableAt + assessment.closesAt}
          assessment={assessment}
          onSaved={onScheduleSaved}
        />
      )}
      <label className="mt-2 block text-xs font-normal">
        New due date
        <input
          aria-label={"Due date for " + assessment.title}
          type="date"
          value={dueDate}
          onChange={(event) => onDueDateChange(event.target.value)}
          className="mt-1 w-full rounded border bg-background p-1.5 text-xs"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1">
        {assessment.status === "draft" && <button disabled={busy} onClick={() => onAction("publish")} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Publish</button>}
        {assessment.status === "published" && <button disabled={busy} onClick={() => onAction("close")} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Close</button>}
        {assessment.status === "closed" && <button disabled={busy} onClick={() => onAction("reopen")} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Reopen</button>}
        {assessment.status !== "draft" && <button disabled={busy || !dueDate} onClick={() => onAction("reschedule")} className="rounded border px-2 py-1 text-xs disabled:opacity-40">Change deadline</button>}
      </div>
    </th>
  );
}
