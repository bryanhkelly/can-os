import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { EvidenceUploadSection, EvidenceWorkflow, EvidenceReviewForm, EvidenceDocumentSummary } from "@/components/evidence";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginExtendedEvidenceUploadFn, finishExtendedEvidenceUploadFn,
  readExtendedEvidenceFn, reviewExtendedEvidenceFn, getExtendedEvidenceDownloadFn,
} from "@/modules/activities/extended-learning-evidence.functions";
import type { ExtendedSeasonApprovalCategory } from "@/domain/extended-learning-approval";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";

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
  return <ExtendedSeasonEvidenceWorkspace key={seasonId} seasonId={seasonId} onChange={onChange} />;
}

function ExtendedSeasonEvidenceWorkspace({ seasonId, onChange }: {
  seasonId: string; onChange?: () => Promise<void> | void;
}) {
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true); setError("");
    try {
      const result = await readExtendedEvidenceFn({ data: { seasonId } });
      if (request === requestSequence.current) setModel(result);
    } catch (cause) {
      if (request === requestSequence.current) {
        setModel(null);
        setError(mutationErrorMessage(cause, "Unable to read evidence"));
      }
      throw cause;
    } finally { if (request === requestSequence.current) setLoading(false); }
  }, [seasonId]);
  useEffect(() => { void load().catch(() => {}); return () => { requestSequence.current++; }; }, [load]);
  async function changed() {
    const result = await readExtendedEvidenceFn({ data: { seasonId } });
    setModel(result);
    await onChange?.();
  }
  return <section className="mt-3 rounded-lg border bg-card p-4" aria-label="Extended-learning operational approvals">
    <h3 className="text-sm font-semibold">Independent operating approval</h3>
    <p className="mt-1 text-xs text-muted-foreground">
      Four restricted documents must be reviewed by a separate CAN network officer.
      Scheduled sessions must also have currently active, assigned onsite staff.
      Expired or superseded evidence blocks new registrations immediately.
    </p>
    <button type="button" className="mt-2 text-xs underline" onClick={() => void load().catch(() => {})} disabled={loading}>
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
  const mutation = useMutationFeedback(changed);
  const busy = mutation.pending || mutation.refreshFailed;
  async function review(decision: "approve" | "reject", reason: string) {
    if (!item.documentId || !item.version || busy) return;
    const outcome = await mutation.run(() => reviewExtendedEvidenceFn({ data: {
        seasonId: model.seasonId, documentId: item.documentId,
        expectedVersion: item.version, reason, decision,
      } }), {
      successMessage: decision === "approve" ? "Independent evidence approval recorded." : "Evidence rejected with correction instructions.",
      commandErrorMessage: "Review failed",
      refreshErrorMessage: "The evidence review was recorded, but current evidence records could not be loaded. Retry the refresh before reviewing again.",
    });
    if (outcome.status === "failed") throw outcome.error;
  }
  return <EvidenceWorkflow title={item.title} status={item.status} rejectionReason={item.rejectionReason}>
    {item.documentId && <EvidenceDocumentSummary
      fileName={item.fileName} version={item.version}
      expiresAt={item.expiresAt} downloadLabel="View private document"
      onGetDownloadUrl={async () => {
        const result = await getExtendedEvidenceDownloadFn({ data: {
          seasonId: model.seasonId, documentId: item.documentId!,
        } });
        return result.downloadUrl;
      }}/>}
    {model.canReview && item.documentId && item.status === "pending" && <EvidenceReviewForm
      disabled={busy} onReview={review}/>}
    <MutationFeedback state={mutation} className="mt-2" pendingMessage="Recording evidence review…"/>
    {model.canSubmit && <div>
      <EvidenceUploadSection<UploadInput> disabled={!model.uploadsEnabled}
        heading={item.documentId ? "Renew or correct this evidence" : "Upload evidence for CAN review"}
        adapter={{begin: async input => beginExtendedEvidenceUploadFn({data:input}),
          finish: async input => finishExtendedEvidenceUploadFn({data:input})}}
        makeInput={(file,expiresAt)=>({seasonId:model.seasonId,category:item.category,
          fileName:file.name,mimeType:file.type as UploadInput["mimeType"],size:file.size,expiresAt})}
        onUploaded={changed}/>
    </div>}
  </EvidenceWorkflow>;
}
