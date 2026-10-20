import { useEffect, useState } from "react";
import {
  beginQualificationUpload, decideQualification, finishQualificationUpload,
  getQualificationEvidence, getQualifications,
} from "@/modules/profiles/qualifications.functions";

type Snapshot = Awaited<ReturnType<typeof getQualifications>>;
type Selection = { personId?: string; programId?: string };

export function Qualifications({ personId, programId, onChanged }: Selection & { onChanged?: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setSnapshot(null); setError("");
    getQualifications({ data: { personId, programId } }).then(result => {
      if (active) setSnapshot(result);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Qualification records are unavailable.");
    });
    return () => { active = false; };
  }, [personId, programId, revision]);
  return <section className="mt-6 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Qualification evidence</h2>
    <p className="mt-2 text-sm">Private credential records are separate from public profile information.
      Verification confirms evidence review, not program eligibility or legal authorization to teach.</p>
    {error && <div role="alert" className="mt-3 text-sm">
      <p>{error}</p><p>Review requires an independent, explicitly granted credential verifier in the teacher's institution.</p>
      <button type="button" className="mt-2 underline" onClick={() => setRevision(value => value + 1)}>Retry qualification records</button>
    </div>}
    {!snapshot && !error && <p role="status" className="mt-3 text-sm">Loading qualification records...</p>}
    {snapshot && <QualificationRecords key={`${personId ?? "self"}:${revision}`} snapshot={snapshot}
      selection={{ personId, programId }} changed={async () => {
        setRevision(value => value + 1);
        await onChanged?.();
      }} />}
  </section>;
}

export function QualificationRecords({ snapshot, selection, changed }: {
  snapshot: Snapshot; selection: Selection; changed: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function run(operation: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); await changed(); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update qualification records."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-4">
    {error && <p role="alert" className="text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {snapshot.canSubmit && <SubmissionForm catalog={snapshot.catalog} jurisdictions={snapshot.jurisdictions}
      uploadsEnabled={snapshot.uploadsEnabled}
      busy={busy} submit={(operation) => run(operation, "Evidence submitted for independent review.")} />}
    {!snapshot.claims.length && <p className="text-sm text-muted-foreground">No qualification claims have been submitted. This is not a verified or eligible status.</p>}
    {snapshot.hasMore && <p className="text-sm">Showing the 100 most recent claims. Older records remain retained.</p>}
    {snapshot.claims.map(claim => <Claim key={claim.id} claim={claim} canReview={snapshot.canReview}
      selection={selection} busy={busy} run={run} />)}
  </div>;
}

function SubmissionForm({ catalog, jurisdictions, uploadsEnabled, busy, submit }: {
  catalog: Snapshot["catalog"]; jurisdictions: Snapshot["jurisdictions"]; busy: boolean;
  uploadsEnabled: boolean;
  submit: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const [definitionId, setDefinitionId] = useState(catalog[0]?.id ?? "");
  const [issuerName, setIssuerName] = useState(""), [jurisdictionId, setJurisdictionId] = useState("");
  const [issuedAt, setIssuedAt] = useState(""), [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<{ key: string; claim: NonNullable<Parameters<typeof beginQualificationUpload>[0]>["data"] } | null>(null);
  async function upload() {
    if (pending) {
      await finishQualificationUpload({ data: pending });
      setPending(null); setFile(null);
      return;
    }
    if (!file) throw new Error("Choose evidence before submitting.");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size < 16 || file.size > 10 * 1024 * 1024) {
      throw new Error("Choose a PDF, JPEG or PNG between 16 bytes and 10 MB.");
    }
    const mimeType = file.type === "application/pdf" ? "application/pdf" : file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const claim = { definitionId, issuerName, ...(jurisdictionId ? { jurisdictionId } : {}),
      ...(issuedAt ? { issuedAt: new Date(issuedAt).toISOString() } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      fileName: file.name, mimeType, size: file.size };
    const upload = await beginQualificationUpload({ data: claim });
    const response = await fetch(upload.uploadUrl, { method: "PUT", body: file, headers: upload.uploadHeaders });
    if (!response.ok) throw new Error("Evidence upload failed; no qualification claim was submitted.");
    const submission = { key: upload.key, claim };
    setPending(submission);
    await finishQualificationUpload({ data: submission });
    setPending(null); setFile(null);
  }
  return <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" onSubmit={event => {
    event.preventDefault(); void submit(upload);
  }}>
    <h3 className="font-semibold sm:col-span-2">Submit qualification evidence</h3>
    {!uploadsEnabled && <p role="alert" className="text-sm sm:col-span-2">Qualification evidence uploads are not enabled for this deployment. Existing records remain readable to authorized viewers.</p>}
    {!catalog.length && <p role="alert" className="text-sm sm:col-span-2">No supported qualification catalog entries are configured. Contact your program administrator.</p>}
    <fieldset disabled={busy || !uploadsEnabled || Boolean(pending)} className="contents">
      <label className="text-sm">Qualification<select required value={definitionId} onChange={event => setDefinitionId(event.target.value)}
        className="mt-1 block w-full rounded border bg-background p-2">
        <option value="">Choose qualification</option>{catalog.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
      </select></label>
      <label className="text-sm">Issuing institution<input required value={issuerName} maxLength={200}
        onChange={event => setIssuerName(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2" /></label>
      <label className="text-sm">Jurisdiction (optional)<select value={jurisdictionId} onChange={event => setJurisdictionId(event.target.value)}
        className="mt-1 block w-full rounded border bg-background p-2"><option value="">Not specified</option>
        {jurisdictions.map(entry => <option key={entry.id} value={entry.id}>{entry.name} ({entry.code})</option>)}
      </select></label>
      <label className="text-sm">Issued at (optional, your local time)<input type="datetime-local" value={issuedAt}
        onChange={event => setIssuedAt(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2" /></label>
      <label className="text-sm">Expires at (optional, your local time)<input type="datetime-local" value={expiresAt}
        onChange={event => setExpiresAt(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2" /></label>
      <label className="text-sm">Evidence (PDF, JPEG or PNG, up to 10 MB)<input type="file" required accept="application/pdf,image/jpeg,image/png"
        onChange={event => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded border p-2" /></label>
    </fieldset>
    <p className="text-xs text-muted-foreground sm:col-span-2">Submit a new claim for renewal or corrected evidence. Prior claims and review history are retained. Storage verification does not approve your qualification.</p>
    {pending && <p role="status" className="text-sm sm:col-span-2">The file uploaded, but submission has not been confirmed. Retry the same submission without uploading again.</p>}
    <button type="submit" disabled={busy || !uploadsEnabled || (!pending && (!file || !definitionId))}
      className="justify-self-start rounded border px-3 py-2 text-sm disabled:opacity-50">{pending ? "Retry submission" : "Submit for review"}</button>
  </form>;
}

function Claim({ claim, canReview, selection, busy, run }: {
  claim: Snapshot["claims"][number]; canReview: boolean; selection: Selection; busy: boolean;
  run: (operation: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(""), [evidenceUrl, setEvidenceUrl] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const expired = claim.expiresAt !== null && new Date(claim.expiresAt) <= new Date();
  return <article className="rounded-lg border p-4">
    <h3 className="font-semibold">{claim.title}</h3>
    <p className="mt-1 text-sm">{claim.issuerName ?? "Issuer not recorded"}{claim.jurisdiction ? ` - ${claim.jurisdiction}` : ""}</p>
    <p className="mt-1 text-sm">Review status: {claim.status}{expired ? " - expired" : ""}</p>
    <p className="mt-1 text-xs text-muted-foreground">Issued: {claim.issuedAt ?? "Not recorded"} | Expires: {claim.expiresAt ?? "Not recorded"}</p>
    {claim.hasEvidence && <button type="button" disabled={busy} className="mt-3 underline text-sm" onClick={() =>
      void run(async () => { const result = await getQualificationEvidence({ data: { ...selection, claimId: claim.id } });
        setEvidenceUrl(result.url); setReviewed(false); }, "Evidence link ready for 60 seconds.")}>Get private evidence link</button>}
    {evidenceUrl && <a className="ml-3 text-sm underline" href={evidenceUrl} target="_blank" rel="noreferrer">Open evidence (short-lived link)</a>}
    {canReview && (claim.status === "pending" || claim.status === "verified") && <div className="mt-3 space-y-2">
      <label className="block text-sm">Review reason<textarea value={reason} maxLength={2000} onChange={event => setReason(event.target.value)}
        className="mt-1 block w-full rounded border bg-background p-2" /></label>
      {claim.status === "pending" && <label className="flex gap-2 text-sm">
        <input type="checkbox" disabled={!evidenceUrl} checked={reviewed} onChange={event => setReviewed(event.target.checked)} />
        I independently reviewed this evidence and the recorded issuer, jurisdiction and validity dates.
      </label>}
      <div className="flex gap-2">{(claim.status === "pending" ? ["approve", "reject"] as const : ["revoke"] as const).map(decision =>
        <button key={decision} type="button" disabled={busy || reason.trim().length < 5 ||
          (decision === "approve" && (!reviewed || expired))}
          onClick={() => void run(() => decideQualification({ data: { ...selection, claimId: claim.id,
            expectedSequence: claim.sequence, decision, reason } }), "Review saved; launch eligibility will be recalculated.")}
          className="rounded border px-3 py-2 text-sm capitalize disabled:opacity-50">{decision}</button>)}</div>
    </div>}
    <details className="mt-3 text-sm"><summary>Immutable review history</summary>
      <ol className="mt-2 space-y-1">{claim.history.map(event => <li key={event.sequence}>
        #{event.sequence} {event.decision} - {event.occurredAt}{event.reason ? ` - ${event.reason}` : ""}
      </li>)}</ol>
      {!claim.history.length && <p>No review decisions recorded.</p>}
    </details>
  </article>;
}
