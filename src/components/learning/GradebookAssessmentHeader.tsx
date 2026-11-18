import { AssessmentDraftEditor } from "@/components/learning/AssessmentDraftEditor";
import { AssessmentScheduleEditor } from "@/components/learning/AssessmentScheduleEditor";
import { Link } from "@tanstack/react-router";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { getGradebook } from "@/modules/learning/gradebook.functions";
import { dateKeyInTimezone, formatDateOnly, formatTimestamp } from "@/modules/calendar/timezone";

type Assessment = Awaited<ReturnType<typeof getGradebook>>["assessments"][number];
type Action = "publish" | "close" | "reopen" | "reschedule";

export function GradebookAssessmentHeader({
  assessment,
  sectionId,
  timezone,
  busy,
  dueDate,
  onDueDateChange,
  onAction,
  onDraftSaved,
  onScheduleSaved,
}: {
  assessment: Assessment;
  sectionId: string;
  timezone: string;
  busy: boolean;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  onAction: (action: Action) => void;
  onDraftSaved: () => Promise<unknown>;
  onScheduleSaved: () => Promise<unknown>;
}) {
  return (
    <th className="min-w-32 p-3 font-semibold">
      <Link to="/teacher/gradebook" search={{section:sectionId,assessment:assessment.id}} className="block underline">{assessment.title}</Link>
      <span className="block text-xs font-normal text-muted-foreground">
        {assessment.dueAt ? `Due ${formatDateOnly(dateKeyInTimezone(assessment.dueAt,timezone))}` : "No due date"}
        {" · "}{assessment.pointsPossible ?? "—"} pts
        {assessment.rubric.length > 0 && ` · ${assessment.rubric.length} criteria`}
        {" · "}{assessment.kind}
        {" · "}{assessment.status}
        {assessment.maxAttempts !== null && " · " + assessment.maxAttempts + " maximum attempts"}
        {assessment.availableAt && " · Releases " + formatTimestamp(assessment.availableAt,timezone)}
        {assessment.closesAt ? " · Closes " + formatTimestamp(assessment.closesAt,timezone) : " · No submission close time"}
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
          timezone={timezone}
          onSaved={onScheduleSaved}
        />
      )}
      <Field className="mt-2 text-left" label={`New due date for ${assessment.title}`}>
        <Input type="date" disabled={busy} value={dueDate} className="min-w-36 text-xs"
          onChange={event => onDueDateChange(event.target.value)}/>
      </Field>
      <div className="mt-2 flex flex-wrap gap-1">
        {assessment.status === "draft" && <Button size="sm" disabled={busy} onClick={() => onAction("publish")}>Publish</Button>}
        {assessment.status === "published" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("close")}>Close</Button>}
        {assessment.status === "closed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("reopen")}>Reopen</Button>}
        {assessment.status !== "draft" && <Button size="sm" variant="outline" disabled={busy || !dueDate} onClick={() => onAction("reschedule")}>Change deadline</Button>}
      </div>
    </th>
  );
}
