import { useState } from "react";
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
    {open && <form className="grid gap-3 rounded-lg border p-3"
      onSubmit={async event => {
        event.preventDefault();
        if (busy || !selected || !confirmed) return;
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
        <label className="grid gap-1 text-sm">Graded assignment to review
          <select className="rounded border p-2" required disabled={busy}
            value={selected} onChange={event => setSelected(event.target.value)}>
            {evidence.availableEvidence.map(row => <option key={row.submissionId} value={row.submissionId}>
              {row.assessmentTitle} · graded {row.gradedAt ? new Date(row.gradedAt).toLocaleDateString() : "unknown date"}
              {row.score === null ? "" : ` · score ${row.score}`}
            </option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Teacher assessment
          <select className="rounded border p-2" value={outcome}
            onChange={event => setOutcome(event.target.value as StudentGoalReviewInput["outcome"])}
            disabled={busy}>
            {(Object.keys(studentGoalOutcomeLabels) as StudentGoalReviewInput["outcome"][])
              .map(key => <option value={key} key={key}>{studentGoalOutcomeLabels[key]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Feedback the student can read
          <textarea className="rounded border p-2" rows={3} required minLength={15} maxLength={700}
            value={studentFeedback} disabled={busy}
            onChange={event => setStudentFeedback(event.target.value)}
            placeholder="Describe what you saw in the student's work and a practical next step." />
        </label>
        <label className="flex gap-2 text-xs">
          <input type="checkbox" required checked={confirmed} disabled={busy}
            onChange={event => setConfirmed(event.target.checked)} />
          I confirmed the selected academic evidence and that my feedback is appropriate to share with the student.
        </label>
        <button type="submit" className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={busy || !confirmed || !selected}>
          {busy ? "Saving…" : "Save teacher-reviewed outcome"}
        </button>
      </>}
      <button type="button" className="text-sm underline" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>}
  </div>;
}
