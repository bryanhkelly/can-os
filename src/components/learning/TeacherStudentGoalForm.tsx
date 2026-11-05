import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [shared, setShared] = useState(false);

  return <div className="mt-3">
    {!expanded && <button type="button" className="text-sm underline"
      onClick={() => setExpanded(true)}>Share a learning goal with student</button>}
    {expanded && <form noValidate className="mt-3 grid gap-3 rounded-lg border p-3"
      onSubmit={async event => {
        event.preventDefault();
        setAttempted(true);
        if (busy || shared || title.trim().length<8 || studentInstructions.trim().length<15 || !confirmedStudentSafe) return;
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
      <Field label="Goal title" className="text-sm" required
        error={attempted&&title.trim().length<8?"Enter a goal title with at least 8 characters.":undefined}>
        <Input value={title} minLength={8} maxLength={120}
          disabled={busy || shared} onChange={event => setTitle(event.target.value)}
          placeholder="Practice solving two-step equations"/>
      </Field>
      <Field label="Instructions for student" className="text-sm" required
        error={attempted&&studentInstructions.trim().length<15?"Enter at least 15 characters of student-facing instructions.":undefined}>
        <Textarea value={studentInstructions} minLength={15} maxLength={750}
          disabled={busy || shared} rows={3}
          onChange={event => setStudentInstructions(event.target.value)}
          placeholder="Complete the assigned practice questions and bring your work to our next check-in."/>
      </Field>
      <Field label="Due date" className="text-sm">
        <Select value={dueInDays} disabled={busy || shared}
          onChange={event => setDueInDays(Number(event.target.value) as 3 | 7 | 14)}
        >
          <option value={3}>In 3 days</option>
          <option value={7}>In 7 days</option>
          <option value={14}>In 14 days</option>
        </Select>
      </Field>
      <Field className="text-xs" required
        label="I reviewed these words for student visibility. They contain no confidential counseling, safeguarding, health or private staff-case information."
        error={attempted&&!confirmedStudentSafe?"Confirm this message is safe for the student to see.":undefined}>
        <Checkbox checked={confirmedStudentSafe} disabled={busy || shared}
          onChange={event => setConfirmedStudentSafe(event.target.checked)} />
      </Field>
      {!shared && <div className="flex gap-3 text-sm">
        <Button type="submit" disabled={busy}>
          {busy ? "Sharing…" : "Share approved goal"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy}
          onClick={() => setExpanded(false)}>Cancel</Button>
      </div>}
      {result && <p role="status" className="text-sm">{result}</p>}
    </form>}
  </div>;
}
