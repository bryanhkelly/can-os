import { useEffect, useRef, useState } from "react";
import type { EnrollmentFormAnswers, enrollmentFormState } from "@/domain/enrollment-form";
import { decideEnrollmentForm, submitGuardianEnrollmentForm } from "@/modules/enrollment/enrollment-form.functions";

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

export function GuardianEnrollmentForm({ applicationId, requirementId, record, closed, onChanged }: {
  applicationId: string; requirementId: string; record: EnrollmentFormRecord; closed: boolean; onChanged: () => Promise<void>;
}) {
  const [answers, setAnswers] = useState<EnrollmentFormAnswers>(record.submission?.answers ?? {});
  const [signerName, setSignerName] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const requestId = useRef<string | null>(null);
  const editable = !closed && (!record.submission || record.review?.status === "rejected");
  function answer(key: string, value: string | boolean) {
    requestId.current = null; setAnswers(current => ({ ...current, [key]: value }));
  }
  return <section className="space-y-3">
    <EnrollmentFormSnapshot record={record} />
    {error && <p role="alert">{error}</p>}
    {editable && <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(""); requestId.current ??= crypto.randomUUID();
      try {
        await submitGuardianEnrollmentForm({ data: { applicationId, requirementId, answers, signerName,
          requestId: requestId.current, formRevision: record.revision, confirmed } });
        await onChanged();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to submit signed enrollment form."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy || !interactive} className="space-y-3">
        {record.form.fields.map(field => <label key={field.key} className="block text-sm">
          {field.label}{field.required ? " (required)" : " (optional)"}
          {field.type === "text" ? <textarea required={field.required} maxLength={4000}
            className="mt-1 block w-full rounded border bg-background p-2"
            value={typeof answers[field.key] === "string" ? String(answers[field.key]) : ""}
            onChange={event => answer(field.key, event.target.value)} /> :
            <select required={field.required} className="ml-3 rounded border bg-background p-2"
              value={answers[field.key] === true ? "yes" : answers[field.key] === false ? "no" : ""}
              onChange={event => {
                if (!event.target.value) {
                  requestId.current = null;
                  setAnswers(current => { const next = { ...current }; delete next[field.key]; return next; });
                } else answer(field.key, event.target.value === "yes");
              }}>
              <option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option>
            </select>}
        </label>)}
        <label className="block text-sm">Typed full name (electronic signature)
          <input required minLength={2} maxLength={200} value={signerName} autoComplete="name"
            className="mt-1 block w-full rounded border bg-background p-2"
            onChange={event => { requestId.current = null; setSignerName(event.target.value); }} />
        </label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={confirmed}
          onChange={event => { requestId.current = null; setConfirmed(event.target.checked); }} />
          I agree to the school statement above and intend my typed name to serve as my electronic signature.</label>
        <p className="text-xs">Your authenticated identity, answers, exact form version and signing time are recorded.
          A registrar must review this form before the requirement is complete.</p>
        <button type="submit" disabled={!confirmed} className="rounded border px-3 py-2 text-sm">
          {busy ? "Submitting signed form..." : record.submission ? "Sign and resubmit corrected form" : "Sign and submit enrollment form"}
        </button>
      </fieldset>
    </form>}
  </section>;
}

export function RegistrarEnrollmentFormReview({ applicationId, requirementId, record, closed, onChanged }: {
  applicationId: string; requirementId: string; record: EnrollmentFormRecord; closed: boolean; onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState<"accepted" | "rejected">("accepted");
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  return <section className="space-y-3">
    <EnrollmentFormSnapshot record={record} />
    {error && <p role="alert">{error}</p>}
    {!record.submission && <p className="text-sm">A currently authorized managing guardian must sign before review. No checklist waiver is available.</p>}
    {!closed && record.submission && !record.review && <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try {
        if (!record.submission) throw new Error("A guardian signature is required.");
        await decideEnrollmentForm({ data: { applicationId, requirementId, submissionId: record.submission.id,
          status, reason, confirmed } });
        await onChanged();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to review enrollment form."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy || !interactive} className="space-y-3">
        <label className="block text-sm">Form decision
          <select value={status} className="ml-3 rounded border bg-background p-2"
            onChange={event => setStatus(event.target.value === "accepted" ? "accepted" : "rejected")}>
            <option value="accepted">Approve signed form</option><option value="rejected">Return for correction and new signature</option>
          </select>
        </label>
        <label className="block text-sm">Review reason (visible to the family)
          <textarea required minLength={5} maxLength={400} value={reason} className="mt-1 block w-full rounded border bg-background p-2"
            onChange={event => setReason(event.target.value)} />
        </label>
        <label className="flex gap-2 text-sm"><input type="checkbox" required checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)} />I confirm this decision for the displayed signed submission.</label>
        <button type="submit" disabled={!confirmed} className="rounded border px-3 py-2 text-sm">Record form review</button>
      </fieldset>
    </form>}
  </section>;
}
