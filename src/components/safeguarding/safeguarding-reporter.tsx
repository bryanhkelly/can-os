import { useRef, useState, type FormEvent } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import type { SafeguardingObservationInput } from "@/domain/safeguarding-intake-policy";
import {
  getMySafeguardingWorkspace,
  reportSafeguardingConcern,
} from "@/modules/safeguarding/safeguarding.functions";
import { SafeguardingEvidenceForm, SafeguardingExternalReportForm } from "./safeguarding-forms";

type Workspace = Awaited<ReturnType<typeof getMySafeguardingWorkspace>>;
type ReporterWorkspace = Extract<Workspace, { mode: "reporter" }>;
type ConcernKind = SafeguardingObservationInput["concernKinds"][number];
const categories: Array<{ value: ConcernKind; label: string }> = [
  { value: "abuse_or_neglect", label: "Abuse or neglect concern" },
  { value: "exploitation_or_coercion", label: "Exploitation or coercion" },
  { value: "bullying_or_peer_harm", label: "Bullying or peer harm" },
  { value: "violence_or_threat", label: "Violence or threat" },
  { value: "substance_or_medical_safety", label: "Substance or medical danger" },
  { value: "self_harm_or_welfare", label: "Self-harm or welfare" },
  { value: "other_or_uncertain", label: "Other or unsure" },
];
const control = "mt-1 min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const date = (value: Date | string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function SafeguardingReporter({ workspace, reload }: {
  workspace: ReporterWorkspace;
  reload: () => Promise<void>;
}) {
  const [immediateDanger, setImmediateDanger] = useState<"yes" | "no" | "unsure">("unsure");
  const [source, setSource] = useState<SafeguardingObservationInput["source"]>("direct_observation");
  const [concernKinds, setConcernKinds] = useState<ConcernKind[]>(["other_or_uncertain"]);
  const [observedAt, setObservedAt] = useState("");
  const [factualObservation, setFactualObservation] = useState("");
  const [immediateActions, setImmediateActions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const idempotencyKey = useRef("");

  function toggle(kind: ConcernKind) {
    setConcernKinds(current => current.includes(kind) ? current.filter(item => item !== kind) : [...current, kind]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !workspace.policy) return;
    setBusy(true); setError(""); setNotice("");
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      const result = await reportSafeguardingConcern({ data: {
        siteId: workspace.site.id, concernKinds, source, immediateDanger,
        observedAt: new Date(observedAt).toISOString(), factualObservation,
        immediateActions: immediateActions.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
      } });
      setNotice(`${result.incidentNumber} is recorded for internal response. This does not confirm emergency dispatch or any outside report.`);
      idempotencyKey.current = ""; setFactualObservation(""); setImmediateActions("");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The concern was not recorded. Use the offline procedure and retry without assuming success.");
    } finally { setBusy(false); }
  }

  return <>
    {workspace.policy ? <>
      <WorkspaceNotice tone="danger">
        <strong>Immediate danger or urgent medical need:</strong> seek real-world emergency help now; do not wait for this app. {workspace.policy.emergencyInstructions}
      </WorkspaceNotice>
      <WorkspacePanel title="Report a safety concern" description="Record what you observed, heard or were told. You do not need to diagnose, investigate or choose a legal conclusion." className="mt-6">
        <form onSubmit={event => void submit(event)} aria-busy={busy}>
          <fieldset disabled={busy} className="grid gap-5">
            <label className="text-sm font-medium">Is anyone in immediate danger or in need of urgent medical assistance?
              <select required className={control} value={immediateDanger} onChange={event => setImmediateDanger(event.target.value as typeof immediateDanger)}>
                <option value="unsure">Unsure</option><option value="yes">Yes — seek immediate real-world help</option><option value="no">No immediate danger identified</option>
              </select>
            </label>
            {immediateDanger === "yes" && <WorkspaceNotice tone="danger">Seek emergency help before relying on an internal report. Filing this form never dispatches emergency services.</WorkspaceNotice>}
            <div>
              <span className="text-sm font-medium">What kind of concern? Choose all that apply.</span>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{categories.map(category => <label key={category.value} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <input type="checkbox" className="size-4" checked={concernKinds.includes(category.value)} onChange={() => toggle(category.value)} />{category.label}
              </label>)}</div>
              {concernKinds.length === 0 && <p role="alert" className="mt-2 text-sm text-destructive">Choose at least one category; “Other or unsure” is allowed.</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">How do you know?
                <select className={control} value={source} onChange={event => setSource(event.target.value as typeof source)}>
                  <option value="direct_observation">I observed it directly</option><option value="student_disclosure">A student disclosed it</option>
                  <option value="third_party_report">Another person reported it</option><option value="uncertain">Source is uncertain</option>
                </select>
              </label>
              <label className="text-sm font-medium">When did you observe or learn of it?
                <Input required type="datetime-local" value={observedAt} onChange={event => setObservedAt(event.target.value)} />
              </label>
            </div>
            <label className="text-sm font-medium">Factual observation or disclosure
              <textarea required minLength={10} maxLength={3000} rows={6} className={control} value={factualObservation} onChange={event => setFactualObservation(event.target.value)} placeholder="What happened, where, who was present, and the child's words as closely as you can recall. Separate facts from uncertainty." />
            </label>
            <label className="text-sm font-medium">Immediate safety steps already taken (optional)
              <textarea maxLength={1500} rows={3} className={control} value={immediateActions} onChange={event => setImmediateActions(event.target.value)} />
            </label>
            <WorkspaceNotice>
              Follow directly applicable external-reporting duties without waiting for internal approval. {workspace.policy.externalReportingInstructions} Guardians are never notified automatically.
            </WorkspaceNotice>
            <Button type="submit" size="lg" disabled={busy || concernKinds.length === 0}><ShieldAlert aria-hidden="true" />{busy ? "Recording concern…" : "Submit restricted safety report"}</Button>
          </fieldset>
          {error && <WorkspaceNotice tone="danger" className="mt-4">{error} Offline procedure: {workspace.policy.offlineInstructions}</WorkspaceNotice>}
          {notice && <WorkspaceNotice tone="success" className="mt-4">{notice}</WorkspaceNotice>}
        </form>
      </WorkspacePanel>
    </> : <WorkspaceNotice tone="danger">Online intake is not active for {workspace.site.name}. Seek emergency help when needed and follow the site's designated offline safeguarding procedure. Do not use ordinary student support instead.</WorkspaceNotice>}

    <section aria-label="My safety report receipts" className="mt-8">
      <h2 className="font-serif text-2xl font-semibold">My report receipts</h2>
      <p className="mt-2 text-sm text-muted-foreground">Only your own receipt, human acknowledgment, evidence you add and outside actions you record appear here. Confidential response work is not visible.</p>
      {!workspace.reports.length ? <EmptyState title="No safety reports from this membership" description="A submitted report will leave a receipt here. It will not become an ordinary support referral." /> : <div className="mt-4 grid gap-4">{workspace.reports.map(report => <article key={report.incidentId} className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{report.incidentNumber}</h3><p className="mt-1 text-xs text-muted-foreground">Reported {date(report.reportedAt)}</p></div>
          <StatusBadge tone={report.acknowledgedAt ? "success" : report.urgent ? "danger" : "attention"}>{report.acknowledgedAt ? "Human response acknowledged" : report.urgent ? "Urgent response pending" : "Internal response pending"}</StatusBadge></div>
        {report.acknowledgedAt && <p className="mt-3 text-sm">Acknowledged {date(report.acknowledgedAt)}. This is internal receipt only.</p>}
        {report.immediateActions && <p className="mt-3 text-sm"><span className="font-medium">Immediate steps you recorded:</span> {report.immediateActions}</p>}
        {!!report.externalReports.length && <div className="mt-4 rounded-xl bg-muted/50 p-3"><h4 className="text-sm font-semibold">Your independent outside-action records</h4><ul className="mt-2 space-y-2 text-sm">{report.externalReports.map(item => <li key={item.id}>{item.status.replaceAll("_", " ")} · {item.agencyLabel} · {date(item.occurredAt)}{item.reference ? ` · ${item.reference}` : ""}</li>)}</ul></div>}
        <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Add to this report</summary>
          <SafeguardingEvidenceForm incidentId={report.incidentId} onSaved={reload} />
          <SafeguardingExternalReportForm incidentId={report.incidentId} onSaved={reload} />
        </details>
      </article>)}</div>}
    </section>
  </>;
}
