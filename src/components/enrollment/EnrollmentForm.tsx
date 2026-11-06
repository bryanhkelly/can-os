import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { DomainError } from "@/domain/errors";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EnrollmentFormAnswers, enrollmentFormState } from "@/domain/enrollment-form";
import { decideEnrollmentForm, submitGuardianEnrollmentForm } from "@/modules/enrollment/enrollment-form.functions";
import { useLaunchDraftChanges } from "@/components/launch-studio/useLaunchUnsavedChanges";

export type EnrollmentFormRecord = NonNullable<ReturnType<typeof enrollmentFormState>> & { revision: string };

export function EnrollmentFormSnapshot({ record }: { record: EnrollmentFormRecord }) {
  return <div className="space-y-2 text-sm">
    <p>School form version: {record.form.version}</p>
    <p className="whitespace-pre-wrap">{record.form.instructions}</p>
    <p className="whitespace-pre-wrap rounded border p-3">{record.form.consent}</p>
    {record.submission && <>
      <dl>{record.form.fields.map(field => <div key={field.key} className="mt-2">
        <dt className="font-semibold">{field.label}</dt>
        <dd className="whitespace-pre-wrap">{typeof record.submission?.answers[field.key] === "boolean"
          ? record.submission.answers[field.key] ? "Yes" : "No"
          : record.submission?.answers[field.key] ?? "Not provided"}</dd>
      </div>)}</dl>
      <p>Signed by {record.submission.signerName} · {new Date(record.submission.signedAt).toLocaleString()}</p>
      <p>{record.review ? `Registrar decision: ${record.review.status}` : "Signed - awaiting registrar review."}</p>
    </>}
    {record.review && <p>Registrar instructions: {record.review.reason}</p>}
  </div>;
}

export function GuardianEnrollmentForm({ applicationId, requirementId, record, closed, onChanged, onDirtyChange }: {
  applicationId: string; requirementId: string; record: EnrollmentFormRecord; closed: boolean; onChanged: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [answers, setAnswers] = useState<EnrollmentFormAnswers>(record.submission?.answers ?? {});
  const [signerName, setSignerName] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const mutation = useMutationFeedback(onChanged);
  const busy = mutation.pending || mutation.refreshFailed;
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const requestId = useRef<string | null>(null);
  const editable = !closed && (!record.submission || record.review?.status === "rejected");
  const changes=useLaunchDraftChanges({answers,signerName,confirmed});
  useEffect(() => { onDirtyChange?.(editable && (changes.dirty || busy)); }, [onDirtyChange,editable,changes.dirty,busy]);
  function answer(key: string, value: string | boolean) {
    requestId.current = null; setAnswers(current => ({ ...current, [key]: value }));
  }
  return <section className="space-y-3">
    <EnrollmentFormSnapshot record={record} />
    <MutationFeedback state={mutation} pendingMessage="Submitting signed enrollment form..."/>
    {editable && <form noValidate className="space-y-3" onSubmit={async event => {
      event.preventDefault();setAttempted(true);
      const missingAnswer=record.form.fields.some(field=>field.required&&
        (answers[field.key]===undefined||answers[field.key]===null||
          (typeof answers[field.key]==="string"&&!String(answers[field.key]).trim())));
      if(missingAnswer||signerName.trim().length<2||!confirmed)return;
      requestId.current ??= crypto.randomUUID();
      const id = requestId.current;
      await mutation.run(async () => {
        const receipt=await submitGuardianEnrollmentForm({ data: { applicationId, requirementId, answers, signerName,
          requestId: id, formRevision: record.revision, confirmed } });
        changes.markSaved({answers,signerName,confirmed});
        return receipt;
      }, {
        successMessage: "Signed enrollment form submitted for registrar review.",
        commandErrorMessage: "Unable to submit signed enrollment form.",
      });
    }}>
      <fieldset disabled={busy || !interactive} className="space-y-3">
        {record.form.fields.map(field => {
          const value=answers[field.key];
          const missing=field.required&&(value===undefined||value===null||(typeof value==="string"&&!value.trim()));
          return <Field key={field.key} label={field.label} required={field.required}
            error={attempted&&missing?"Complete this required answer.":undefined}>
          {field.type === "text" ? <Textarea maxLength={4000}
            value={typeof answers[field.key] === "string" ? String(answers[field.key]) : ""}
            onChange={event => answer(field.key, event.target.value)} /> :
            <Select
              value={answers[field.key] === true ? "yes" : answers[field.key] === false ? "no" : ""}
              onChange={event => {
                if (!event.target.value) {
                  requestId.current = null;
                  setAnswers(current => { const next = { ...current }; delete next[field.key]; return next; });
                } else answer(field.key, event.target.value === "yes");
              }}>
              <option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option>
            </Select>}
        </Field>;
        })}
        <Field label="Typed full name (electronic signature)" required
          error={attempted&&signerName.trim().length<2?"Enter your full name to sign this form.":undefined}>
          <Input minLength={2} maxLength={200} value={signerName} autoComplete="name"
            onChange={event => { requestId.current = null; setSignerName(event.target.value); }} />
        </Field>
        <Field label="I agree to the school statement above and intend my typed name to serve as my electronic signature." required
          error={attempted&&!confirmed?"Confirm your agreement before signing.":undefined}>
          <Checkbox checked={confirmed} onChange={event => { requestId.current = null; setConfirmed(event.target.checked); }} />
        </Field>
        <p className="text-xs">Your authenticated identity, answers, exact form version and signing time are recorded.
          A registrar must review this form before the requirement is complete.</p>
        <Button type="submit" disabled={busy || !interactive}>
          {busy ? "Submitting signed form..." : record.submission ? "Sign and resubmit corrected form" : "Sign and submit enrollment form"}
        </Button>
      </fieldset>
    </form>}
  </section>;
}

export function RegistrarEnrollmentFormReview({ applicationId, requirementId, record, closed, onChanged }: {
  applicationId: string; requirementId: string; record: EnrollmentFormRecord; closed: boolean; onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState<"accepted" | "rejected">("accepted");
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const mutation = useMutationFeedback(onChanged);
  const busy = mutation.pending || mutation.refreshFailed;
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  return <section className="space-y-3">
    <EnrollmentFormSnapshot record={record} />
    <MutationFeedback state={mutation} pendingMessage="Saving enrollment form review..."/>
    {!record.submission && <p className="text-sm">A currently authorized managing guardian must sign before review. No checklist waiver is available.</p>}
    {!closed && record.submission && !record.review && <form noValidate className="space-y-3" onSubmit={async event => {
      event.preventDefault();
      setAttempted(true);
      if(reason.trim().length<5||!confirmed)return;
      await mutation.run(() => {
        const submission = record.submission;
        if (!submission) throw new DomainError("CONFLICT", "The signed enrollment form is no longer available for review.");
        return decideEnrollmentForm({ data: { applicationId, requirementId, submissionId: submission.id,
          status, reason, confirmed } });
      }, {
        successMessage: status === "accepted" ? "Signed enrollment form approved." : "Enrollment form returned for correction.",
        commandErrorMessage: "Unable to review enrollment form.",
      });
    }}>
      <fieldset disabled={busy || !interactive} className="space-y-3">
        <Field label="Form decision" className="text-sm">
          <Select value={status}
            onChange={event => setStatus(event.target.value === "accepted" ? "accepted" : "rejected")}>
            <option value="accepted">Approve signed form</option><option value="rejected">Return for correction and new signature</option>
          </Select>
        </Field>
        <Field label="Review reason (visible to the family)" className="text-sm" required
          error={attempted&&reason.trim().length<5?"Enter at least 5 characters explaining the review.":undefined}>
          <Textarea minLength={5} maxLength={400} value={reason} onChange={event => setReason(event.target.value)} />
        </Field>
        <Field label="I confirm this decision for the displayed signed submission." required
          error={attempted&&!confirmed?"Confirm this decision before recording it.":undefined}>
          <Checkbox checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        </Field>
        <Button type="submit" disabled={busy || !interactive}>Record form review</Button>
      </fieldset>
    </form>}
  </section>;
}
