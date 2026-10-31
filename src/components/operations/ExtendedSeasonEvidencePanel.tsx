import { EvidenceUploader, EvidenceWorkflow, EvidenceHistory } from "@/components/evidence";
import { EvidenceReviewForm } from "@/components/evidence/EvidenceReviewForm";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function review(decision: "approve" | "reject", reason: string) {
    if (!item.documentId || !item.version || busy) return;
    setBusy(true); setError("");
    try {
      await reviewExtendedEvidenceFn({ data: {
        seasonId: model.seasonId, documentId: item.documentId,
        expectedVersion: item.version, reason, decision,
      } });
      await changed();
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
  return <EvidenceWorkflow title={item.title} status={item.status} rejectionReason={item.rejectionReason}>
    {item.documentId && <div className="mt-2">
      <p>{item.fileName} · version {item.version} · expires {item.expiresAt ?
        new Date(item.expiresAt).toLocaleDateString() : "unknown"}</p>
      <button type="button" className="mt-1 underline" onClick={() => void download()}>
        View private document
      </button>
    </div>}
    {model.canReview && item.documentId && item.status === "pending" && <EvidenceReviewForm
      disabled={busy} onReview={review}/>}
    {model.canSubmit && <div className="mt-3 border-t pt-3">
      <p>{item.documentId ? "Renew or correct this evidence" : "Upload evidence for CAN review"}</p>
      <EvidenceUploader<UploadInput> disabled={!model.uploadsEnabled}
        adapter={{begin: async input => beginExtendedEvidenceUploadFn({data:input}),
          finish: async input => finishExtendedEvidenceUploadFn({data:input})}}
        makeInput={(file,expiresAt)=>({seasonId:model.seasonId,category:item.category,
          fileName:file.name,mimeType:file.type as UploadInput["mimeType"],size:file.size,expiresAt})}
        onUploaded={changed}/>
    </div>}
    {error && <p role="alert" className="mt-2">{error}</p>}
  </EvidenceWorkflow>;
}
