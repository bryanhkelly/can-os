import type { ReactNode } from "react";

/** Presentation-only invitation status; delivery and identity remain server authoritative. */
export interface FamilyInvitationRecipientStatus {
  status: string;
}
export interface FamilyInvitationBatchSummary {
  id: string;
  programName: string;
  subject: string;
  createdAt: string | Date;
  status: string;
  outboxStatus?: string | null;
  recipients: readonly FamilyInvitationRecipientStatus[];
}

export function FamilyInvitationBatchList({
  batches, busy, onRetry,
}: {
  batches: readonly FamilyInvitationBatchSummary[];
  busy: boolean;
  onRetry: (batchId: string) => void;
}) {
  return <section className="mt-8 space-y-3">
    <h2 className="text-lg font-semibold">Recent invitation batches</h2>
    {batches.map(batch => {
      const responded = batch.recipients.filter(row => row.status === "responded").length;
      const providerAccepted = batch.recipients.filter(row => row.status === "provider_accepted").length;
      const retrying = batch.recipients.filter(row => row.status === "retrying").length;
      return <article key={batch.id} className="rounded-lg border bg-card p-4">
        <p className="font-semibold">{batch.programName} · {batch.subject}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(batch.createdAt).toLocaleString()} · {batch.status} · {batch.outboxStatus ?? "Queued for dispatch"}
        </p>
        <p className="mt-2 text-sm">{batch.recipients.length} recipient(s): {responded} verified a link; {providerAccepted} provider accepted; {retrying} require retry.</p>
        {retrying > 0 && <button type="button" disabled={busy} onClick={() => onRetry(batch.id)}
          className="mt-3 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">
          Retry unaccepted invitations
        </button>}
        <p className="mt-2 text-xs text-muted-foreground">
          Provider acceptance does not confirm inbox delivery. A verified email link is not proof of guardianship or admission.
        </p>
      </article>;
    })}
    {!batches.length && <p className="rounded-lg border p-4 text-sm">No invitations are recorded for your schools.</p>}
  </section>;
}

/** Shared feedback for admission and launch invitation workflows. */
export function FamilyInvitationFeedback({ notice, error }: { notice?: string; error?: string }): ReactNode {
  return <>
    {notice && <p role="status" className="mt-5 rounded border p-4 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-5 rounded border p-4 text-sm">{error}</p>}
  </>;
}
