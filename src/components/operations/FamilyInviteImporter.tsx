import { useMemo, useRef, useState } from "react";
import { familyInvitationProgress, familyInvitationRetryLabel } from "@/domain/family-invitation-progress";
import { useRouter } from "@tanstack/react-router";
import { familyInvitationLaunchScope } from "@/domain/family-invitation-launch-scope";
import { parseFamilyContacts } from "@/domain/family-contact-import";
import {
  FAMILY_INVITATION_MAX_RECIPIENTS,
  type FamilyInvitationWorkspace,
} from "@/domain/family-invitations";
import {
  retryFamilyInvitationBatch,
  sendFamilyInvitations,
} from "@/modules/enrollment/family-invitations.functions";

function recipientStatus(status: FamilyInvitationWorkspace["batches"][number]["recipients"][number]["status"], outboxStatus: FamilyInvitationWorkspace["batches"][number]["outboxStatus"]) {
  switch (status) {
    case "responded": return "Application opened";
    case "provider_accepted": return "Provider accepted · inbox delivery not verified";
    case "retrying": return familyInvitationRetryLabel(outboxStatus);
    case "queued": return "Queued";
  }
}

export function FamilyInviteImporter({
  workspace,
  selectedProgramId,
  selectedSiteId,
}: {
  workspace: FamilyInvitationWorkspace | null;
  selectedProgramId?: string;
  selectedSiteId?: string;
}) {
  const router = useRouter();
  const { programs, batches, initialProgram } = familyInvitationLaunchScope(workspace, {
    siteId: selectedSiteId, programId: selectedProgramId,
  });
  const [programId, setProgramId] = useState(initialProgram?.id ?? "");
  const selectedProgram = programs.find(program => program.id === programId) ?? (programs.length === 1 ? programs[0] : undefined);
  const [raw, setRaw] = useState("");
  const [subject, setSubject] = useState(`${initialProgram?.name ?? "Our school"} is welcoming families`);
  const [introduction, setIntroduction] = useState("We're excited to invite your family to learn about our school.");
  const [preview, setPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const parsed = useMemo(() => parseFamilyContacts(raw), [raw]);
  const tooMany = parsed.contacts.length > FAMILY_INVITATION_MAX_RECIPIENTS;

  function changed() {
    requestId.current = crypto.randomUUID();
    setPreview(false);
    setConfirmed(false);
    setResult("");
  }
  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError("Choose a CSV or text file smaller than 1 MB.");
      return;
    }
    setError("");
    setRaw(await file.text());
    changed();
  }
  async function send() {
    if (!selectedProgram || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const response = await sendFamilyInvitations({ data: {
        requestId: requestId.current,
        programId: selectedProgram.id,
        rawContacts: raw,
        subject,
        introduction,
        confirmed: true,
      } });
      setResult(response.created
        ? `${response.recipientCount} recipients saved and queued. ${response.skippedExisting} already had an invitation or response.`
        : "This invitation batch was already saved; no duplicate batch was created.");
      setRaw("");
      setPreview(false);
      setConfirmed(false);
      requestId.current = crypto.randomUUID();
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to queue family invitations");
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed(batchId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await retryFamilyInvitationBatch({ data: { batchId } });
      setResult(response.retried
        ? `Retry queued for ${response.retried} recipient${response.retried === 1 ? "" : "s"}. Provider acceptance is not inbox delivery.`
        : "No failed recipients are waiting for a retry.");
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to retry failed invitations");
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) {
    return <section id="invite-families" className="mt-7 scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-7" aria-label="Invite families">
      <h2 className="font-serif text-2xl">Invite families</h2>
      <p role="status" className="mt-3 text-sm text-muted-foreground">Family outreach is unavailable. Launch management remains accessible.</p>
    </section>;
  }

  return <section className="mt-7 rounded-2xl border bg-card p-5 sm:p-7" aria-label="Invite families">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Family outreach · Verified application links</p>
    <h2 className="mt-2 font-serif text-2xl">Invite families</h2>
    <p className="mt-2 text-sm text-muted-foreground">Paste up to {FAMILY_INVITATION_MAX_RECIPIENTS} addresses, review the recipients and message, then queue secure links directly to the published school application. Existing family identities are reused only after the recipient verifies their email and the existing account resolves to one Person.</p>

    {!programs.length ? <p role="status" className="mt-5 rounded-lg border p-4 text-sm">The selected school has no published, active, admissions-authorized Program available for invitations. Publish the Site and Program and confirm operating authorization before inviting families.</p> : <>
      <label className="mt-5 block text-sm font-semibold">Published school application
        <select value={selectedProgram?.id ?? ""} onChange={event => {
          const program = programs.find(item => item.id === event.target.value);
          setProgramId(event.target.value);
          if (program) setSubject(`${program.name} is welcoming families`);
          changed();
        }} className="mt-2 block w-full rounded-lg border bg-background p-3 font-normal">
          <option value="">Choose the intended school application</option>
          {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
        </select>
      </label>
      {selectedProgram && <p className="mt-2 text-xs text-muted-foreground">Destination: <a href={selectedProgram.publishedSiteUrl} target="_blank" rel="noreferrer" className="underline">published school page</a>. Email recipients go directly to its verified application.</p>}

      <label className="mt-5 block text-sm font-semibold">Paste families
        <textarea value={raw} onChange={event => { setRaw(event.target.value); changed(); }}
          rows={7} placeholder={"john@example.com\nMary Jones <mary@example.com>\nJane Smith,jane@example.com"}
          className="mt-2 w-full rounded-xl border bg-background p-3 font-normal" />
      </label>
      <label className="mt-4 block text-sm font-semibold">Or upload CSV / text (up to 1 MB)
        <input type="file" accept=".csv,.txt,text/csv,text/plain" className="mt-2 block w-full text-sm font-normal"
          onChange={event => void loadFile(event.target.files?.[0])} />
      </label>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-live="polite">
        <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{parsed.contacts.length}</strong>Valid contacts</p>
        <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{parsed.duplicates}</strong>Duplicates removed</p>
        <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{parsed.issues.length - parsed.duplicates}</strong>Need attention</p>
      </div>
      {tooMany && <p role="alert" className="mt-3 rounded-lg border border-destructive p-3 text-sm">Reduce this batch to {FAMILY_INVITATION_MAX_RECIPIENTS} valid recipients.</p>}
      {parsed.contacts.length > 0 && <details className="mt-4 rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-semibold">Review {parsed.contacts.length} valid recipients</summary>
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto" aria-label="Validated family contacts">
          {parsed.contacts.map(contact => <li key={contact.email} className="break-words border-b pb-2 text-sm">
            <span className="font-medium">{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Name not supplied"}</span>
            <span className="ml-2 text-muted-foreground">{contact.email}</span>
          </li>)}
        </ul>
      </details>}
      {parsed.issues.length > 0 && <details className="mt-4 rounded-lg border p-3" open>
        <summary className="cursor-pointer text-sm font-semibold">Review skipped rows</summary>
        <ul className="mt-3 space-y-2">{parsed.issues.map(issue => <li key={issue.line} className="break-words text-sm">Line {issue.line}: {issue.reason} — {issue.raw}</li>)}</ul>
      </details>}
      <div className="mt-6 grid gap-4">
        <label className="text-sm font-semibold">Subject
          <input value={subject} maxLength={120} onChange={event => { setSubject(event.target.value); changed(); }} className="mt-2 w-full rounded-lg border bg-background p-3 font-normal" />
        </label>
        <label className="text-sm font-semibold">Personal introduction
          <textarea rows={3} value={introduction} maxLength={2000} onChange={event => { setIntroduction(event.target.value); changed(); }} className="mt-2 w-full rounded-lg border bg-background p-3 font-normal" />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Email uses the server-approved CAN access-mail sender. A typed sender or reply-to address cannot override it.</p>
      <button type="button" disabled={!selectedProgram || busy || !parsed.contacts.length || tooMany || !subject.trim() || !introduction.trim()}
        onClick={() => { setPreview(true); setConfirmed(false); }}
        className="mt-5 min-h-11 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Preview invitation</button>
      {preview && <div className="mt-6 rounded-xl border p-5" aria-label="Invitation preview">
        <h3 className="font-semibold">Invitation preview · {parsed.contacts.length} families</h3>
        <p className="mt-2 font-semibold">{subject}</p>
        <p className="mt-4 whitespace-pre-wrap text-sm">{introduction}</p>
        <p className="mt-3 text-sm">Each email includes a single-use, 10-minute link directly to {selectedProgram?.name}'s verified application.</p>
        <label className="mt-5 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I reviewed the recipients and message and have a school-approved basis to contact these families.</label>
        <button type="button" disabled={!selectedProgram || !confirmed || busy} onClick={() => void send()}
          className="mt-4 min-h-11 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving and queueing…" : "Save and queue invitations"}</button>
      </div>}
    </>}

    {error && <p role="alert" className="mt-4 rounded-lg border border-destructive p-3 text-sm">{error}</p>}
    {result && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{result}</p>}

    {batches.length > 0 && <div className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Family invitation progress">
      <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{batches.reduce((total,batch)=>total+batch.recipients.length,0)}</strong>Invitation recipients</p>
      <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{batches.reduce((total,batch)=>total+batch.recipients.filter(recipient=>recipient.status==="responded").length,0)}</strong>Application links opened</p>
      <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{batches.reduce((total,batch)=>total+batch.recipients.filter(recipient=>recipient.status==="retrying").length,0)}</strong>Recipients needing retry</p>
    </div>}

    {batches.length > 0 && <div className="mt-8">
      <h3 className="font-serif text-xl">Invitation responses</h3>
      <p className="mt-1 text-xs text-muted-foreground">Provider acceptance is not inbox delivery. A response is recorded only when the recipient redeems the verified application link.</p>
      <div className="mt-3 space-y-3">{batches.map(batch => {
        const progress = familyInvitationProgress(batch);
        return <details key={batch.id} className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-semibold">{batch.subject} · {batch.programName} · {batch.recipients.length} recipients</summary>
        <p className="mt-2 text-xs text-muted-foreground">Queued {new Date(batch.createdAt).toLocaleString()} · {progress.label}</p>
        {progress.canRetry && <button type="button" disabled={busy} onClick={() => void retryFailed(batch.id)}
          className="mt-3 min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? "Queueing retry…" : `Retry ${progress.failedRecipients} failed recipient${progress.failedRecipients === 1 ? "" : "s"}`}
        </button>}
        <ul className="mt-3 space-y-2">{batch.recipients.map(recipient => <li key={recipient.email} className="flex flex-col gap-1 border-b pb-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="break-words">{[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "Name not supplied"} · {recipient.email}</span>
          <span className="text-xs text-muted-foreground">{recipientStatus(recipient.status, batch.outboxStatus)}{recipient.respondedAt ? ` · ${new Date(recipient.respondedAt).toLocaleString()}` : ""}</span>
        </li>)}</ul>
      </details>;
      })}</div>
    </div>}
  </section>;
}


