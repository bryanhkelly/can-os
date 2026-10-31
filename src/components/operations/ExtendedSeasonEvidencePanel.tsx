import { useCallback, useEffect, useState } from "react";
import {
  beginExtendedEvidenceUploadFn, finishExtendedEvidenceUploadFn,
  readExtendedEvidenceFn, reviewExtendedEvidenceFn, getExtendedEvidenceDownloadFn,
} from "@/modules/activities/extended-learning-evidence.functions";
import type { ExtendedSeasonApprovalCategory } from "@/domain/extended-learning-approval";

type Model = Awaited<ReturnType<typeof readExtendedEvidenceFn>>;
type Item = Model["categories"][number];
type UploadInput = {
  seasonId: string; category: ExtendedSeasonApprovalCategory; expiresAt: string;
  fileName: string; mimeType: "application/pdf" | "image/jpeg" | "image/png"; size: number;
};

/** One workflow for local registrar submission and independent CAN officer review. */
export function ExtendedSeasonEvidencePanel({ seasonId, onChange }: {
  seasonId: string; onChange?: () => Promise<void> | void;
}) {
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setModel(await readExtendedEvidenceFn({ data: { seasonId } })); }
    catch (cause) { setModel(null); setError(cause instanceof Error ? cause.message : "Unable to read evidence"); }
    finally { setLoading(false); }
  }, [seasonId]);
  useEffect(() => { void load(); }, [load]);
  async function changed() { await load(); await onChange?.(); }
  return <section className="mt-3 rounded-lg border bg-card p-4" aria-label="Extended-learning operational approvals">
    <h3 className="text-sm font-semibold">Independent operating approval</h3>
    <p className="mt-1 text-xs text-muted-foreground">
      Four restricted documents must be reviewed by a separate CAN network officer.
      Scheduled sessions must also have currently active, assigned onsite staff.
      Expired or superseded evidence blocks new registrations immediately.
    </p>
    <button type="button" className="mt-2 text-xs underline" onClick={() => void load()} disabled={loading}>
      {loading ? "Refreshing…" : "Refresh evidence"}
    </button>
    {error && <p role="alert" className="mt-2 text-xs">{error}</p>}
    {model && <>
      <p className="mt-2 text-xs font-medium">{model.opening.ready ? "Opening prerequisites approved" :
        "Registration blocked: " + model.opening.blockers.join("; ")}</p>
      {!model.uploadsEnabled && model.canSubmit && <p role="status" className="mt-2 text-xs">
        Private evidence uploads are disabled in this deployment. Enable the existing R2
        school-opening upload configuration before accepting documents.
      </p>}
      <div className="mt-3 grid gap-3">
        {model.categories.map(item => <EvidenceCard key={item.category} model={model}
          item={item} changed={changed}/>)}
      </div>
      {model.canSubmit && <p className="mt-3 text-xs text-muted-foreground">
        Your submitted files require independent review. Share
        <a className="ml-1 underline" href="/enrichment-review">the CAN review workspace</a>
        with an authorized network steward.
      </p>}
    </>}
  </section>;
}

function EvidenceCard({ model, item, changed }: {
  model: Model; item: Item; changed: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ key: string; input: UploadInput } | null>(null);
  async function upload() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      let attempt = pending;
      if (!attempt) {
        if (!file || !expiry) throw new Error("Select a file and its real expiry date");
        const input: UploadInput = {
          seasonId: model.seasonId, category: item.category,
          fileName: file.name, mimeType: file.type as UploadInput["mimeType"],
          size: file.size, expiresAt: new Date(expiry + "T23:59:59.999Z").toISOString(),
        };
        const started = await beginExtendedEvidenceUploadFn({ data: input });
        const sent = await fetch(started.uploadUrl, {
          method: "PUT", headers: started.uploadHeaders, body: file,
        });
        if (!sent.ok) throw new Error("Private upload failed; no evidence was recorded");
        attempt = { key: started.key, input };
        setPending(attempt);
      }
      await finishExtendedEvidenceUploadFn({ data: { ...attempt.input, key: attempt.key } });
      setFile(null); setExpiry(""); setPending(null);
      await changed();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  async function review(decision: "approve" | "reject") {
    if (!item.documentId || !item.version || busy) return;
    setBusy(true); setError("");
    try {
      await reviewExtendedEvidenceFn({ data: {
        seasonId: model.seasonId, documentId: item.documentId,
        expectedVersion: item.version, reason, decision,
      } });
      setReason(""); await changed();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review failed"); }
    finally { setBusy(false); }
  }
  async function download() {
    if (!item.documentId) return;
    setError("");
    try {
      const result = await getExtendedEvidenceDownloadFn({ data: {
        seasonId: model.seasonId, documentId: item.documentId!,
      } });
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open evidence"); }
  }
  return <article className="rounded border p-3 text-xs">
    <div className="flex items-center justify-between gap-3">
      <strong>{item.title}</strong><span className="font-medium">{item.status}</span>
    </div>
    {item.documentId && <div className="mt-2">
      <p>{item.fileName} · version {item.version} · expires {item.expiresAt ?
        new Date(item.expiresAt).toLocaleDateString() : "unknown"}</p>
      <button type="button" className="mt-1 underline" onClick={() => void download()}>
        View private document
      </button>
    </div>}
    {item.rejectionReason && <p role="alert" className="mt-2">Review: {item.rejectionReason}</p>}
    {model.canReview && item.documentId && item.status === "pending" && <div className="mt-3 border-t pt-3">
      <label className="block">Review rationale
        <textarea className="mt-1 w-full rounded border bg-background p-2"
          value={reason} minLength={10} maxLength={2000}
          onChange={e => setReason(e.target.value)}/>
      </label>
      <div className="mt-2 flex gap-2">
        <button type="button" className="rounded border px-2 py-1" disabled={busy || reason.trim().length < 10}
          onClick={() => void review("approve")}>Approve evidence</button>
        <button type="button" className="rounded border px-2 py-1" disabled={busy || reason.trim().length < 10}
          onClick={() => void review("reject")}>Reject and request correction</button>
      </div>
    </div>}
    {model.canSubmit && <div className="mt-3 border-t pt-3">
      <p>{item.documentId ? "Renew or correct this evidence" : "Upload evidence for CAN review"}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label>PDF, JPEG or PNG
          <input type="file" accept="application/pdf,image/jpeg,image/png"
            disabled={busy || !model.uploadsEnabled} className="mt-1 block w-full"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setPending(null); }}/>
        </label>
        <label>Evidence expiration
          <input type="date" value={expiry} disabled={busy || !model.uploadsEnabled}
            className="mt-1 block w-full rounded border bg-background p-2"
            onChange={e => { setExpiry(e.target.value); setPending(null); }}/>
        </label>
      </div>
      <button type="button" className="mt-2 rounded border px-2 py-1"
        disabled={busy || !model.uploadsEnabled || (!pending && (!file || !expiry))}
        onClick={() => void upload()}>
        {pending ? "Retry recording uploaded evidence" : "Submit for review"}
      </button>
    </div>}
    {error && <p role="alert" className="mt-2">{error}</p>}
  </article>;
}
