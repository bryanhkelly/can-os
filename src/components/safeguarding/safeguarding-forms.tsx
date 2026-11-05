import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  addRestrictedSafeguardingEvidence,
  recordIndependentSafeguardingExternalReport,
} from "@/modules/safeguarding/safeguarding.functions";

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
  const [attempted,setAttempted]=useState(false);
  const idempotencyKey = useRef("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (busy||description.trim().length<3) return;
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
      setError(mutationErrorMessage(cause, "Evidence was not saved. Do not assume it was recorded; retry with the same details."));
    } finally { setBusy(false); }
  }

  return <div className="mt-4">
    <Button variant="outline" size="sm" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      {open ? "Close evidence form" : "Add evidence record"}
    </Button>
    {open && <form noValidate onSubmit={event => void submit(event)} aria-busy={busy} className="mt-4 rounded-xl border p-4">
      <fieldset disabled={busy} className="grid gap-4">
        <Field label="Evidence source" className="text-sm">
          <Select value={type} onChange={event => setType(event.target.value as typeof type)}>
            <option value="observation">Observation note</option><option value="document">Restricted document</option>
            <option value="photograph">Photograph</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Factual description" className="text-sm" required
          error={attempted&&description.trim().length<3?"Enter a factual description with at least 3 characters.":undefined}>
          <Textarea minLength={3} maxLength={2000} rows={3} value={description} onChange={event => setDescription(event.target.value)} />
        </Field>
        <Field label="Restricted document ID (optional)" className="text-sm">
          <Input value={documentId} onChange={event => setDocumentId(event.target.value)} placeholder="Only an existing document attached to this incident" />
        </Field>
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
  const [attempted,setAttempted]=useState(false);
  const idempotencyKey = useRef("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (busy||agencyLabel.trim().length<2||!occurredAt||!Number.isFinite(new Date(occurredAt).getTime())) return;
    setBusy(true); setError("");
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      await recordIndependentSafeguardingExternalReport({ data: {
        incidentId, idempotencyKey: idempotencyKey.current, status, agencyType,
        agencyLabel, channel, occurredAt: new Date(occurredAt).toISOString(),
        reference: reference.trim() || undefined, details: details.trim() || undefined,
      } });
      idempotencyKey.current = ""; setOpen(false); setDetails(""); setReference("");setAttempted(false);
      await onSaved();
    } catch (cause) {
      setError(mutationErrorMessage(cause, "The outside action was not recorded. Retry; do not infer submission from an error."));
    } finally { setBusy(false); }
  }

  return <WorkspacePanel title="Record an independent outside action" description="Record only something you personally did or know occurred. An internal acknowledgment is not an external report." className="mt-5">
    <Button variant="outline" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      {open ? "Close outside-action form" : "Record outside action"}
    </Button>
    {open && <form noValidate onSubmit={event => void submit(event)} aria-busy={busy} className="mt-5 grid gap-4">
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <Field label="Record status" className="text-sm">
          <Select value={status} onChange={event => setStatus(event.target.value as typeof status)}>
            <option value="attempted">Attempted</option><option value="submitted">Submitted</option>
            <option value="agency_acknowledged">Agency acknowledged</option>
          </Select>
        </Field>
        <Field label="Channel" className="text-sm">
          <Select value={channel} onChange={event => setChannel(event.target.value as typeof channel)}>
            <option value="phone">Phone</option><option value="online">Online</option>
            <option value="in_person">In person</option><option value="formal_notice">Formal notice</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Outside destination" className="text-sm">
          <Select value={agencyType} onChange={event => setAgencyType(event.target.value as typeof agencyType)}>
            <option value="child_welfare">Child welfare</option><option value="emergency_services">Emergency services</option>
            <option value="law_enforcement">Law enforcement</option><option value="medical">Medical</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Agency or service name" className="text-sm" required
          error={attempted&&agencyLabel.trim().length<2?"Enter the name of the outside agency or service.":undefined}>
          <Input minLength={2} maxLength={200} value={agencyLabel} onChange={event => setAgencyLabel(event.target.value)} />
        </Field>
        <Field label="When this happened" className="text-sm" required
          error={attempted&&(!occurredAt||!Number.isFinite(new Date(occurredAt).getTime()))?"Choose a valid date and time.":undefined}>
          <Input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} />
        </Field>
        <Field label="Receipt or reference (only if known)" className="text-sm">
          <Input maxLength={300} value={reference} onChange={event => setReference(event.target.value)} />
        </Field>
        <Field label="Factual details (optional)" className="text-sm sm:col-span-2">
          <Textarea rows={3} maxLength={2000} value={details} onChange={event => setDetails(event.target.value)} />
        </Field>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Recording…" : "Save outside-action record"}</Button></div>
      </fieldset>
      {error && <WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    </form>}
  </WorkspacePanel>;
}
