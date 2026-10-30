import { useState } from "react";
import { shareTeacherStudentGoal } from "@/modules/learning/teacher-student-goal.functions";

/** Explicit academic handoff: the teacher writes fresh student-facing text. */
export function TeacherStudentGoalForm({
  teacherActionId,
}: { teacherActionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [studentInstructions, setStudentInstructions] = useState("");
  const [dueInDays, setDueInDays] = useState<3 | 7 | 14>(7);
  const [confirmedStudentSafe, setConfirmedStudentSafe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [shared, setShared] = useState(false);

  return <div className="mt-3">
    {!expanded && <button type="button" className="text-sm underline"
      onClick={() => setExpanded(true)}>Share a learning goal with student</button>}
    {expanded && <form className="mt-3 grid gap-3 rounded-lg border p-3"
      onSubmit={async event => {
        event.preventDefault();
        if (busy || shared || !confirmedStudentSafe) return;
        setBusy(true);
        setResult("");
        try {
          const response = await shareTeacherStudentGoal({ data: {
            teacherActionId, title, studentInstructions, dueInDays,
            confirmedStudentSafe: true as const,
          } });
          setShared(true);
          setResult(response.created
            ? "Goal shared in the student's learning support Actions."
            : "A goal was already shared for this follow-up.");
        } catch {
          setResult("Unable to share this goal. Verify your assignment and keep sensitive case information out of the student message.");
        } finally {
          setBusy(false);
        }
      }}>
      <p className="font-semibold text-sm">Student-facing learning goal</p>
      <p className="text-xs text-muted-foreground">
        Write a new academic task appropriate for the student. Do not paste private
        intervention observations, counseling notes, allegations, or safeguarding details.
        Sharing does not close your teacher follow-up.
      </p>
      <label className="grid gap-1 text-sm">Goal title
        <input value={title} required minLength={8} maxLength={120}
          disabled={busy || shared} onChange={event => setTitle(event.target.value)}
          className="rounded border p-2" placeholder="Practice solving two-step equations"/>
      </label>
      <label className="grid gap-1 text-sm">Instructions for student
        <textarea value={studentInstructions} required minLength={15} maxLength={750}
          disabled={busy || shared} rows={3}
          onChange={event => setStudentInstructions(event.target.value)}
          className="rounded border p-2"
          placeholder="Complete the assigned practice questions and bring your work to our next check-in."/>
      </label>
      <label className="grid gap-1 text-sm">Due date
        <select value={dueInDays} disabled={busy || shared}
          onChange={event => setDueInDays(Number(event.target.value) as 3 | 7 | 14)}
          className="rounded border p-2">
          <option value={3}>In 3 days</option>
          <option value={7}>In 7 days</option>
          <option value={14}>In 14 days</option>
        </select>
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" required checked={confirmedStudentSafe}
          disabled={busy || shared} onChange={event => setConfirmedStudentSafe(event.target.checked)} />
        I reviewed these words for student visibility. They contain no confidential
        counseling, safeguarding, health or private staff-case information.
      </label>
      {!shared && <div className="flex gap-3 text-sm">
        <button type="submit" disabled={busy || !confirmedStudentSafe} className="rounded border px-3 py-2 font-semibold disabled:opacity-50">
          {busy ? "Sharing…" : "Share approved goal"}
        </button>
        <button type="button" disabled={busy} className="underline"
          onClick={() => setExpanded(false)}>Cancel</button>
      </div>}
      {result && <p role="status" className="text-sm">{result}</p>}
    </form>}
  </div>;
}
