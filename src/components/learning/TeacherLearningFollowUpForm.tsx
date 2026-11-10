import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTeacherLearningFollowUp } from "@/modules/learning/teacher-learning-followup.functions";
import { followUpApproachLabels, type TeacherLearningFollowUpInput } from "@/domain/teacher-learning-followup";

type Approach = TeacherLearningFollowUpInput["approach"];
type Days = TeacherLearningFollowUpInput["dueInDays"];

/** A deliberate staff action; telemetry alone never generates a referral. */
export function TeacherLearningFollowUpForm({ sectionId, studentProfileId, learningEventId, onCreated }: {
  sectionId: string; studentProfileId: string; learningEventId: string; onCreated?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [observation, setObservation] = useState("");
  const [approach, setApproach] = useState<Approach>("check_in");
  const [dueInDays, setDueInDays] = useState<Days>(3);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [created, setCreated] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  return <div className="mt-3 text-sm">
    {!expanded && <button type="button" className="underline" onClick={() => setExpanded(true)}>
      Plan a teacher follow-up
    </button>}
    {expanded && <form noValidate className="grid gap-3 rounded-lg border p-3"
      onSubmit={async event => {
        event.preventDefault();
        setAttempted(true);
        if (busy||observation.trim().length<15) return;
        setBusy(true);
        try {
          const result = await createTeacherLearningFollowUp({data:{
            sectionId, studentProfileId, learningEventId, observation, approach, dueInDays,
          }});
          setNotice(result.created
            ? "Your follow-up was created and assigned to you in the school's Actions."
            : "An open follow-up already exists for this learning event.");
          setCreated(true);
          setActionId(result.actionId);
          onCreated?.();
        } catch {
          setNotice("Unable to save follow-up. Check your permissions and current evidence.");
        } finally { setBusy(false); }
      }}>
      <p className="font-semibold">Teacher-reviewed support</p>
      <p className="text-xs text-muted-foreground">Learning interaction history is contextual evidence, not proof that a student needs intervention. Record an independent observation before creating an Action.</p>
      <Field label="Your observation" required
        error={attempted&&observation.trim().length<15?"Enter at least 15 characters describing what you observed.":undefined}>
        <Textarea value={observation} minLength={15} maxLength={500} disabled={busy || created}
          onChange={e => setObservation(e.target.value)} rows={2}
          placeholder="Describe the support need you observed; avoid sensitive personal details." />
      </Field>
      <Field label="Support approach">
        <Select value={approach} disabled={busy || created} onChange={e => setApproach(e.target.value as Approach)}>
          {(Object.keys(followUpApproachLabels) as Approach[]).map(key =>
            <option key={key} value={key}>{followUpApproachLabels[key]}</option>)}
        </Select>
      </Field>
      <Field label="Follow-up deadline">
        <Select value={dueInDays} disabled={busy || created} onChange={e => setDueInDays(Number(e.target.value) as Days)}>
          <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option>
        </Select>
      </Field>
      {!created && <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Create follow-up Action"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setExpanded(false)} disabled={busy}>Cancel</Button>
      </div>}
      {notice && <p role="status">{notice}</p>}
      {actionId && <Link to="/actions/$actionId" params={{ actionId }} className="font-semibold underline">Open follow-up Action</Link>}
    </form>}
  </div>;
}
