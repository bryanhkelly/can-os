import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getStudentGoalGradedEvidence, reviewStudentLearningGoal,
} from "@/modules/learning/student-goal-review.functions";
import {
  studentGoalOutcomeLabels, type StudentGoalReviewInput,
} from "@/domain/teacher-student-goal";

/** The teacher selects an actually graded submission; never paste a student ID
 * or declare mastery from telemetry. This review is student-visible. */
export function TeacherStudentGoalReviewForm({
  goalActionId, onReviewed,
}: { goalActionId: string; onReviewed: () => void }) {
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<
    Awaited<ReturnType<typeof getStudentGoalGradedEvidence>> | null>(null);
  const [selected, setSelected] = useState("");
  const [outcome, setOutcome] = useState<StudentGoalReviewInput["outcome"]>("needs_more_practice");
  const [studentFeedback, setStudentFeedback] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [attempted, setAttempted] = useState(false);

  async function loadEvidence() {
    setBusy(true); setMessage("");
    try {
      const result = await getStudentGoalGradedEvidence({ data: { goalActionId } });
      setEvidence(result);
      setSelected(current => result.availableEvidence.some(r => r.submissionId === current)
        ? current : (result.availableEvidence[0]?.submissionId ?? ""));
    } catch {
      setMessage("Unable to load graded work for this student and class.");
    } finally { setBusy(false); }
  }
  return <div className="mt-3">
    {!open && <button type="button" className="text-sm underline" onClick={() => {
      setOpen(true); void loadEvidence();
    }}>Review student learning goal</button>}
    {open && <form noValidate className="grid gap-3 rounded-lg border p-3"
      onSubmit={async event => {
        event.preventDefault();
        setAttempted(true);
        if (busy || !selected || studentFeedback.trim().length<15 || !confirmed) return;
        setBusy(true); setMessage("");
        try {
          await reviewStudentLearningGoal({ data: {
            goalActionId, gradedSubmissionId: selected, outcome,
            studentFeedback, confirmedStudentSafe: true as const,
          } });
          setMessage("Teacher review saved to the student's learning goal.");
          setOpen(false);
          onReviewed();
        } catch {
          setMessage("Review was not saved. Verify this is the latest graded attempt for the enrolled student.");
          void loadEvidence();
        } finally { setBusy(false); }
      }}>
      <p className="text-sm font-semibold">Review against graded coursework</p>
      <p className="text-xs text-muted-foreground">Only graded work completed after this goal was shared is eligible. A score alone is not an automatic mastery decision.</p>
      {!evidence && <p role="status" className="text-sm">Loading graded work…</p>}
      {evidence && !evidence.availableEvidence.length &&
        <p className="text-sm">No eligible graded submission yet. Keep the goal open until academic evidence is available.</p>}
      {evidence && !!evidence.availableEvidence.length && <>
        <Field label="Graded assignment to review" className="text-sm" required
          error={attempted&&!selected?"Choose a graded assignment to review.":undefined}>
          <Select disabled={busy}
            value={selected} onChange={event => setSelected(event.target.value)}>
            {evidence.availableEvidence.map(row => <option key={row.submissionId} value={row.submissionId}>
              {row.assessmentTitle} · graded {row.gradedAt ? new Date(row.gradedAt).toLocaleDateString() : "unknown date"}
              {row.score === null ? "" : ` · score ${row.score}`}
            </option>)}
          </Select>
        </Field>
        <Field label="Teacher assessment" className="text-sm">
          <Select value={outcome}
            onChange={event => setOutcome(event.target.value as StudentGoalReviewInput["outcome"])}
            disabled={busy}>
            {(Object.keys(studentGoalOutcomeLabels) as StudentGoalReviewInput["outcome"][])
              .map(key => <option value={key} key={key}>{studentGoalOutcomeLabels[key]}</option>)}
          </Select>
        </Field>
        <Field label="Feedback the student can read" className="text-sm" required
          error={attempted&&studentFeedback.trim().length<15?"Enter at least 15 characters of student-visible feedback.":undefined}>
          <Textarea rows={3} minLength={15} maxLength={700}
            value={studentFeedback} disabled={busy}
            onChange={event => setStudentFeedback(event.target.value)}
            placeholder="Describe what you saw in the student's work and a practical next step." />
        </Field>
        <Field className="text-xs" required
          label="I confirmed the selected academic evidence and that my feedback is appropriate to share with the student."
          error={attempted&&!confirmed?"Confirm the evidence and student-safety review.":undefined}>
          <Checkbox checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
        </Field>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Saving…" : "Save teacher-reviewed outcome"}
        </Button>
      </>}
      <button type="button" className="text-sm underline" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>}
  </div>;
}
