import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type EvidenceDecision = "approve" | "reject";

export interface EvidenceReviewFormProps {
  onReview: (decision: EvidenceDecision, reason: string) => Promise<void>;
  disabled?: boolean;
  label?: string;
  approveLabel?: string;
  rejectLabel?: string;
}

/** Presentation only: authorization and reviewer independence are enforced by the caller's server command. */
export function EvidenceReviewForm({
  onReview, disabled = false, label = "Review rationale",
  approveLabel = "Approve evidence", rejectLabel = "Reject and request correction",
}: EvidenceReviewFormProps) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const busy = disabled || pending;
  async function submit(decision: EvidenceDecision) {
    if (inFlight.current || disabled || reason.trim().length < 10 || reason.trim().length > 2000) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await onReview(decision, reason);
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence review was not recorded");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return <div className="mt-3 rounded border p-3 text-xs">
    <label className="block">{label}
      <textarea className="mt-1 block w-full rounded border bg-background p-2"
        value={reason} minLength={10} maxLength={2000} disabled={busy}
        onChange={event => setReason(event.target.value)} />
    </label>
    <div className="mt-2 flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm"
        disabled={busy || reason.trim().length < 10 || reason.trim().length > 2000} onClick={() => void submit("approve")}>
        {pending ? "Recording review…" : approveLabel}
      </Button>
      <Button type="button" variant="outline" size="sm"
        disabled={busy || reason.trim().length < 10 || reason.trim().length > 2000} onClick={() => void submit("reject")}>
        {rejectLabel}
      </Button>
    </div>
    {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
  </div>;
}
