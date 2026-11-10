import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/workspace";
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
  const [attempted, setAttempted] = useState(false);

  if (item.status === "resolved") return item.resolutionNote
    ? <p className="mt-2 whitespace-pre-wrap text-xs">{item.resolutionNote}</p> : null;
  return <div className="mt-3">
    {!expanded && <button type="button" className="text-sm underline"
      onClick={() => setExpanded(true)}>Document follow-up and close</button>}
    {expanded && <form noValidate className="mt-3 grid gap-3 rounded border p-3"
      onSubmit={async event => {
        event.preventDefault();
        setAttempted(true);
        if(supportProvided.trim().length<15||outcomeEvidence.trim().length<15)return;
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
      <Field label="Support provided" className="text-sm" required
        error={attempted&&supportProvided.trim().length<15?"Enter at least 15 characters describing the support provided.":undefined}>
        <Textarea rows={2} disabled={busy} minLength={15} maxLength={1000} value={supportProvided}
          onChange={e => setSupportProvided(e.target.value)}
          placeholder="What did you do to support the student?" />
      </Field>
      <Field label="Outcome assessed by you" className="text-sm">
        <Select value={outcome} disabled={busy}
          onChange={e => setOutcome(e.target.value as Outcome)}>
          {(Object.keys(teacherFollowUpOutcomeLabels) as Outcome[]).map(key =>
            <option key={key} value={key}>{teacherFollowUpOutcomeLabels[key]}</option>)}
        </Select>
      </Field>
      <Field label="Evidence or next step" className="text-sm" required
        error={attempted&&outcomeEvidence.trim().length<15?"Enter at least 15 characters of outcome evidence or a next step.":undefined}>
        <Textarea rows={2} disabled={busy} minLength={15} maxLength={1000} value={outcomeEvidence}
          onChange={e => setOutcomeEvidence(e.target.value)}
          placeholder="Describe student work, feedback, or the next support needed. Do not infer mastery from clicks." />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Saving…" : "Record outcome and resolve"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setExpanded(false)}>Cancel</Button>
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>}
  </div>;
}

export function TeacherLearningFollowUpsPanel({ revision = 0 }: { revision?: number }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getTeacherLearningFollowUps>> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    void getTeacherLearningFollowUps().then(value => {
      setData(value); setError("");
    }).catch(() => setError("Unable to load your assigned learning follow-ups."));
  }, []);
  useEffect(() => { load(); }, [load, revision]);

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
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{item.sectionTitle}</span>
            <StatusBadge tone={item.status === "resolved" ? "success" : item.status === "waiting" ? "attention" : item.status === "in_progress" ? "info" : "neutral"}>
              <span className="capitalize">{item.status.replaceAll("_", " ")}</span>
            </StatusBadge>
            <span>
            {item.dueAt ? ` · due ${new Date(item.dueAt).toLocaleDateString()}` : ""}
            </span>
          </div>
          <p className="mt-1 font-semibold"><Link to="/staff/students/$personId"
            params={{ personId: item.studentPersonId }} className="underline">{item.studentName}</Link></p>
          {item.description && <p className="mt-1 text-sm">{item.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            Planned support: {followUpApproachLabels[item.approach as keyof typeof followUpApproachLabels] ?? "Teacher check-in"}
          </p>
          <nav aria-label={`Related work for ${item.studentName}`} className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link to="/actions/$actionId" params={{ actionId: item.id }} className="underline">Action details</Link>
            <Link to="/teacher/gradebook" search={{ section: item.sectionId, student: item.studentProfileId }} className="underline">Review student work</Link>
          </nav>
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
