import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  addRestrictedSafeguardingEvidence,
  recordIndependentSafeguardingExternalReport,
} from "@/modules/safeguarding/safeguarding.functions";

const control = "mt-1 min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SafeguardingEvidenceForm({ incidentId, onSaved }: {
  incidentId: string;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"observation" | "document" | "photograph" | "other">("observation");
  const [description, setDescription] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      await addRestrictedSafeguardingEvidence({ data: {
        incidentId, idempotencyKey: idempotencyKey.current, type,
        description, documentId: documentId.trim() || undefined,
      } });
      setDescription(""); setDocumentId(""); idempotencyKey.current = "";
      await onSaved(); setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence was not saved. Do not assume it was recorded; retry with the same details.");
    } finally { setBusy(false); }
  }

  return <div className="mt-4">
    <Button variant="outline" size="sm" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      {open ? "Close evidence form" : "Add evidence record"}
    </Button>
    {open && <form onSubmit={event => void submit(event)} aria-busy={busy} className="mt-4 rounded-xl border p-4">
      <fieldset disabled={busy} className="grid gap-4">
        <label className="text-sm font-medium">Evidence source
          <select className={control} value={type} onChange={event => setType(event.target.value as typeof type)}>
            <option value="observation">Observation note</option><option value="document">Restricted document</option>
            <option value="photograph">Photograph</option><option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm font-medium">Factual description
          <textarea required minLength={3} maxLength={2000} rows={3} className={control} value={description} onChange={event => setDescription(event.target.value)} />
        </label>
        <label className="text-sm font-medium">Restricted document ID (optional)
          <Input value={documentId} onChange={event => setDocumentId(event.target.value)} placeholder="Only an existing document attached to this incident" />
        </label>
        <p className="text-xs text-muted-foreground">This preserves an evidence reference; it does not upload a file or establish a finding.</p>
        <Button type="submit" disabled={busy}>{busy ? "Saving evidence…" : "Save evidence record"}</Button>
      </fieldset>
      {error && <WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
    </form>}
  </div>;
}

export function SafeguardingExternalReportForm({ incidentId, onSaved }: {
  incidentId: string;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"attempted" | "submitted" | "agency_acknowledged">("attempted");
  const [agencyType, setAgencyType] = useState<"emergency_services" | "child_welfare" | "law_enforcement" | "medical" | "other">("child_welfare");
  const [agencyLabel, setAgencyLabel] = useState("");
  const [channel, setChannel] = useState<"phone" | "online" | "in_person" | "formal_notice" | "other">("phone");
  const [occurredAt, setOccurredAt] = useState("");
  const [reference, setReference] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      await recordIndependentSafeguardingExternalReport({ data: {
        incidentId, idempotencyKey: idempotencyKey.current, status, agencyType,
        agencyLabel, channel, occurredAt: new Date(occurredAt).toISOString(),
        reference: reference.trim() || undefined, details: details.trim() || undefined,
      } });
      idempotencyKey.current = ""; setOpen(false); setDetails(""); setReference("");
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The outside action was not recorded. Retry; do not infer submission from an error.");
    } finally { setBusy(false); }
  }

  return <WorkspacePanel title="Record an independent outside action" description="Record only something you personally did or know occurred. An internal acknowledgment is not an external report." className="mt-5">
    <Button variant="outline" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      {open ? "Close outside-action form" : "Record outside action"}
    </Button>
    {open && <form onSubmit={event => void submit(event)} aria-busy={busy} className="mt-5 grid gap-4">
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Record status
          <select className={control} value={status} onChange={event => setStatus(event.target.value as typeof status)}>
            <option value="attempted">Attempted</option><option value="submitted">Submitted</option>
            <option value="agency_acknowledged">Agency acknowledged</option>
          </select>
        </label>
        <label className="text-sm font-medium">Channel
          <select className={control} value={channel} onChange={event => setChannel(event.target.value as typeof channel)}>
            <option value="phone">Phone</option><option value="online">Online</option>
            <option value="in_person">In person</option><option value="formal_notice">Formal notice</option><option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm font-medium">Outside destination
          <select className={control} value={agencyType} onChange={event => setAgencyType(event.target.value as typeof agencyType)}>
            <option value="child_welfare">Child welfare</option><option value="emergency_services">Emergency services</option>
            <option value="law_enforcement">Law enforcement</option><option value="medical">Medical</option><option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm font-medium">Agency or service name
          <Input required minLength={2} maxLength={200} value={agencyLabel} onChange={event => setAgencyLabel(event.target.value)} />
        </label>
        <label className="text-sm font-medium">When this happened
          <Input required type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} />
        </label>
        <label className="text-sm font-medium">Receipt or reference (only if known)
          <Input maxLength={300} value={reference} onChange={event => setReference(event.target.value)} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">Factual details (optional)
          <textarea rows={3} maxLength={2000} className={control} value={details} onChange={event => setDetails(event.target.value)} />
        </label>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Recording…" : "Save outside-action record"}</Button></div>
      </fieldset>
      {error && <WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    </form>}
  </WorkspacePanel>;
}
