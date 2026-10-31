import { useState } from "react";
import { createTeacherLearningFollowUp } from "@/modules/learning/teacher-learning-followup.functions";
import { followUpApproachLabels, type TeacherLearningFollowUpInput } from "@/domain/teacher-learning-followup";

type Approach = TeacherLearningFollowUpInput["approach"];
type Days = TeacherLearningFollowUpInput["dueInDays"];

/** A deliberate staff action; telemetry alone never generates a referral. */
export function TeacherLearningFollowUpForm({ sectionId, studentProfileId, learningEventId }: {
  sectionId: string; studentProfileId: string; learningEventId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [observation, setObservation] = useState("");
  const [approach, setApproach] = useState<Approach>("check_in");
  const [dueInDays, setDueInDays] = useState<Days>(3);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [created, setCreated] = useState(false);

  return <div className="mt-3 text-sm">
    {!expanded && <button type="button" className="underline" onClick={() => setExpanded(true)}>
      Plan a teacher follow-up
    </button>}
    {expanded && <form className="grid gap-3 rounded-lg border p-3"
      onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          const result = await createTeacherLearningFollowUp({data:{
            sectionId, studentProfileId, learningEventId, observation, approach, dueInDays,
          }});
          setNotice(result.created
            ? "Your follow-up was created and assigned to you in the school's Actions."
            : "An open follow-up already exists for this learning event.");
          setCreated(true);
        } catch {
          setNotice("Unable to save follow-up. Check your permissions and current evidence.");
        } finally { setBusy(false); }
      }}>
      <p className="font-semibold">Teacher-reviewed support</p>
      <p className="text-xs text-muted-foreground">Learning interaction history is contextual evidence, not proof that a student needs intervention. Record an independent observation before creating an Action.</p>
      <label className="grid gap-1">Your observation
        <textarea value={observation} required minLength={15} maxLength={500} disabled={busy || created}
          onChange={e => setObservation(e.target.value)} rows={2}
          className="w-full rounded border p-2" placeholder="Describe the support need you observed; avoid sensitive personal details." />
      </label>
      <label className="grid gap-1">Support approach
        <select value={approach} disabled={busy || created} onChange={e => setApproach(e.target.value as Approach)} className="rounded border p-2">
          {(Object.keys(followUpApproachLabels) as Approach[]).map(key =>
            <option key={key} value={key}>{followUpApproachLabels[key]}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Follow-up deadline
        <select value={dueInDays} disabled={busy || created} onChange={e => setDueInDays(Number(e.target.value) as Days)} className="rounded border p-2">
          <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option>
        </select>
      </label>
      {!created && <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="rounded border px-3 py-2 font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Create follow-up Action"}
        </button>
        <button type="button" onClick={() => setExpanded(false)} className="underline" disabled={busy}>Cancel</button>
      </div>}
      {notice && <p role="status">{notice}</p>}
    </form>}
  </div>;
}
