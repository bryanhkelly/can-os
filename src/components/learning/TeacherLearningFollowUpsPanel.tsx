import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { TeacherStudentGoalForm } from "./TeacherStudentGoalForm";
import { TeacherStudentGoalReviewForm } from "./TeacherStudentGoalReviewForm";
import {
  getTeacherLearningFollowUps,
  resolveTeacherLearningFollowUp,
} from "@/modules/learning/teacher-followup-resolution.functions";
import {
  teacherFollowUpOutcomeLabels,
  followUpApproachLabels,
  type TeacherFollowUpResolutionInput,
} from "@/domain/teacher-learning-followup";

type QueueItem = Awaited<ReturnType<typeof getTeacherLearningFollowUps>>["items"][number];
type Outcome = TeacherFollowUpResolutionInput["outcome"];

function TeacherFollowUpResolution({ item, onSaved }: { item: QueueItem; onSaved: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [supportProvided, setSupportProvided] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("not_yet_verified");
  const [outcomeEvidence, setOutcomeEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (item.status === "resolved") return item.resolutionNote
    ? <p className="mt-2 whitespace-pre-wrap text-xs">{item.resolutionNote}</p> : null;
  return <div className="mt-3">
    {!expanded && <button type="button" className="text-sm underline"
      onClick={() => setExpanded(true)}>Document follow-up and close</button>}
    {expanded && <form className="mt-3 grid gap-3 rounded border p-3"
      onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setMessage("");
        try {
          const saved = await resolveTeacherLearningFollowUp({ data: {
            actionId: item.id, supportProvided, outcome, outcomeEvidence,
          } });
          setMessage(saved.alreadyResolved ? "Follow-up was already resolved." : "Support and outcome recorded.");
          onSaved();
        } catch {
          setMessage("Unable to close this follow-up. Verify your assignment and current student enrollment.");
        } finally {
          setBusy(false);
        }
      }}>
      <label className="grid gap-1 text-sm">Support provided
        <textarea className="rounded border p-2" rows={2} required disabled={busy}
          minLength={15} maxLength={1000} value={supportProvided}
          onChange={e => setSupportProvided(e.target.value)}
          placeholder="What did you do to support the student?" />
      </label>
      <label className="grid gap-1 text-sm">Outcome assessed by you
        <select value={outcome} disabled={busy} className="rounded border p-2"
          onChange={e => setOutcome(e.target.value as Outcome)}>
          {(Object.keys(teacherFollowUpOutcomeLabels) as Outcome[]).map(key =>
            <option key={key} value={key}>{teacherFollowUpOutcomeLabels[key]}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Evidence or next step
        <textarea className="rounded border p-2" rows={2} required disabled={busy}
          minLength={15} maxLength={1000} value={outcomeEvidence}
          onChange={e => setOutcomeEvidence(e.target.value)}
          placeholder="Describe student work, feedback, or the next support needed. Do not infer mastery from clicks." />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Record outcome and resolve"}
        </button>
        <button type="button" disabled={busy} className="text-sm underline"
          onClick={() => setExpanded(false)}>Cancel</button>
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>}
  </div>;
}

export function TeacherLearningFollowUpsPanel() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getTeacherLearningFollowUps>> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    void getTeacherLearningFollowUps().then(value => {
      setData(value); setError("");
    }).catch(() => setError("Unable to load your assigned learning follow-ups."));
  }, []);
  useEffect(() => { load(); }, [load]);

  return <section className="mt-10" aria-label="My teacher learning follow-ups">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">My learning follow-ups</p>
    <p className="mt-2 text-sm text-muted-foreground">
      Teacher-owned support Actions in your currently assigned classes. Student work and teacher judgment, not activity counts, determine the outcome.
    </p>
    {!data && !error && <p role="status" className="mt-3 text-sm">Loading assigned follow-ups…</p>}
    {error && <p role="status" className="mt-3 text-sm">{error} <button className="underline"
      type="button" onClick={load}>Retry</button></p>}
    {data && <>
      {data.truncated && <p className="mt-2 text-sm">Showing a limited set of follow-ups. Use the school Actions workspace for the full queue.</p>}
      {!data.items.length && <p className="mt-4 text-sm">No open or recently resolved learning follow-ups in your assigned classes.</p>}
      <div className="mt-4 grid gap-3">
        {data.items.map(item => <article className="rounded-xl border p-4" key={item.id}>
          <p className="text-xs text-muted-foreground">{item.sectionTitle} · {item.status.replaceAll("_", " ")}
            {item.dueAt ? ` · due ${new Date(item.dueAt).toLocaleDateString()}` : ""}
          </p>
          <p className="mt-1 font-semibold"><Link to="/staff/students/$personId"
            params={{ personId: item.studentPersonId }} className="underline">{item.studentName}</Link></p>
          {item.description && <p className="mt-1 text-sm">{item.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            Planned support: {followUpApproachLabels[item.approach as keyof typeof followUpApproachLabels] ?? "Teacher check-in"}
          </p>
          {!item.studentGoal && item.status !== "resolved" &&
            <TeacherStudentGoalForm teacherActionId={item.id} />}
          {item.studentGoal?.status === "resolved" &&
            <p className="mt-2 text-sm">Shared student goal reviewed and marked met.</p>}
          {item.studentGoal && item.studentGoal.status !== "resolved" &&
            <TeacherStudentGoalReviewForm
              goalActionId={item.studentGoal.id} onReviewed={load} />}
          <TeacherFollowUpResolution item={item} onSaved={load} />
        </article>)}
      </div>
    </>}
  </section>;
}
