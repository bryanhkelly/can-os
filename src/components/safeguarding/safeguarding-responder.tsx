import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, QueryState, StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  acknowledgeAssignedSafeguardingConcern,
  escalateAssignedSafeguardingConcern,
  getAssignedSafeguardingCase,
  getMySafeguardingWorkspace,
} from "@/modules/safeguarding/safeguarding.functions";
import { SafeguardingEvidenceForm, SafeguardingExternalReportForm } from "./safeguarding-forms";

type Workspace = Awaited<ReturnType<typeof getMySafeguardingWorkspace>>;
type ResponderWorkspace = Extract<Workspace, { mode: "responder" }>;
type CaseDetail = Awaited<ReturnType<typeof getAssignedSafeguardingCase>>;
const date = (value: Date | string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const name = (row: { preferredName: string | null; legalFirstName: string; legalLastName: string }) => row.preferredName ?? `${row.legalFirstName} ${row.legalLastName}`;

export function SafeguardingResponder({ workspace, initialCaseId, reload }: {
  workspace: ResponderWorkspace;
  initialCaseId?: string;
  reload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(initialCaseId ?? "");
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const openCase = useCallback(async (incidentId: string) => {
    setSelectedId(incidentId); setLoading(true); setError(""); setNotice("");
    try { setDetail(await getAssignedSafeguardingCase({ data: { incidentId } })); }
    catch (cause) { setDetail(null); setError(cause instanceof Error ? cause.message : "This restricted case cannot be opened."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!initialCaseId) return;
    const task = window.setTimeout(() => void openCase(initialCaseId), 0);
    return () => window.clearTimeout(task);
  }, [initialCaseId, openCase]);

  async function refresh() { await reload(); if (selectedId) await openCase(selectedId); }

  async function command(kind: "acknowledge" | "escalate") {
    if (!selectedId || busy) return;
    setBusy(kind); setError(""); setNotice("");
    try {
      if (kind === "acknowledge") {
        await acknowledgeAssignedSafeguardingConcern({ data: { incidentId: selectedId } });
        setNotice("Your human acknowledgment is recorded. It is not an outside-agency report.");
      } else {
        const result = await escalateAssignedSafeguardingConcern({ data: { incidentId: selectedId } });
        setNotice(result.escalated ? "Deputy and CAN fallback coverage has been assigned where not already active." : "Deputy and CAN fallback coverage is already assigned; no duplicate escalation was created.");
      }
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The response update was not saved."); }
    finally { setBusy(""); }
  }

  return <div className="grid gap-6 lg:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
    <section aria-label="Assigned safeguarding cases">
      <h2 className="font-serif text-2xl font-semibold">My assigned cases</h2>
      <p className="mt-2 text-sm text-muted-foreground">Site membership alone grants no access. Only active named assignments appear.</p>
      {!workspace.cases.length ? <EmptyState title="No assigned safeguarding cases" description="Ordinary support referrals and unassigned incidents are not available in this workspace." /> : <div className="mt-4 space-y-3">{workspace.cases.map(item => <button key={item.incidentId} type="button" onClick={() => void openCase(item.incidentId)} aria-pressed={selectedId === item.incidentId} className={"w-full rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (selectedId === item.incidentId ? "bg-muted" : "bg-card")}>
        <span className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{item.incidentNumber}</span><StatusBadge tone={item.urgent ? "danger" : item.acknowledgedAt ? "success" : "attention"}>{item.urgent ? "Urgent" : item.acknowledgedAt ? "Acknowledged" : "Needs response"}</StatusBadge></span>
        <span className="mt-2 block text-xs text-muted-foreground">{item.responsibility.replaceAll("_", " ")} · reported {date(item.reportedAt)}</span>
        <span className="mt-1 block text-xs">{item.concernKinds.map(kind => kind.replaceAll("_", " ")).join(", ")}</span>
      </button>)}</div>}
    </section>
    <div className="min-w-0">
      <QueryState loading={loading ? "Loading assigned restricted case…" : undefined} error={error || undefined} isEmpty={!selectedId && !loading} empty={<EmptyState title="Select an assigned case" description="Opening a case checks your current capability, scope and named assignment and records a sensitive-read audit." />}>
        {detail && <>
          <WorkspacePanel title={detail.incident.incidentNumber} description={`Reported ${date(detail.incident.reportedAt)} · ${detail.concern.urgent ? "Urgent human review" : "Restricted safeguarding response"}`} actions={<StatusBadge tone="danger">Restricted</StatusBadge>}>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!!busy} onClick={() => void command("acknowledge")}>{busy === "acknowledge" ? "Recording…" : "Acknowledge human response"}</Button>
              <Button variant="outline" disabled={!!busy} onClick={() => void command("escalate")}>{busy === "escalate" ? "Escalating…" : "Escalate to fallback"}</Button>
            </div>
            {notice && <WorkspaceNotice tone="success" className="mt-4">{notice}</WorkspaceNotice>}
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">Observed or learned</dt><dd className="mt-1">{date(detail.incident.occurredAt)}</dd></div>
              <div><dt className="font-semibold">Child</dt><dd className="mt-1">{detail.student?.name ?? "Not identified by profile; use the factual observation"}</dd></div>
              <div><dt className="font-semibold">Concern categories</dt><dd className="mt-1">{detail.concern.concernKinds.map(kind => kind.replaceAll("_", " ")).join(", ")}</dd></div>
              <div><dt className="font-semibold">Source</dt><dd className="mt-1">{detail.concern.source.replaceAll("_", " ")}</dd></div>
              <div><dt className="font-semibold">Immediate danger response</dt><dd className="mt-1">{detail.concern.immediateDanger}</dd></div>
              <div><dt className="font-semibold">Acknowledgment target</dt><dd className="mt-1">{date(detail.concern.acknowledgmentDueAt)}</dd></div>
            </dl>
            <section className="mt-6 rounded-xl border p-4"><h3 className="text-sm font-semibold">Factual observation as reported</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{detail.incident.summary}</p></section>
            {detail.incident.immediateActions && <section className="mt-4 rounded-xl border p-4"><h3 className="text-sm font-semibold">Immediate steps recorded by reporter</h3><p className="mt-2 whitespace-pre-wrap text-sm">{detail.incident.immediateActions}</p></section>}
            <WorkspaceNotice className="mt-5">This is a concern report, not a finding. Do not automatically notify guardians. Internal receipt and external reporting remain separate, and any individual legal duty is not delayed by this workflow.</WorkspaceNotice>
          </WorkspacePanel>

          <WorkspacePanel title="Response and acknowledgment" description="Named case responsibility, not site-wide browsing." className="mt-5">
            <ul className="grid gap-3 text-sm">{detail.assignments.map(assignment => {
              const acknowledgment = detail.notifications.find(item => item.recipientPersonId === assignment.personId && item.acknowledgedAt);
              return <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><span>{name(assignment)} <span className="text-muted-foreground">· {assignment.responsibility.replaceAll("_", " ")}</span></span><StatusBadge tone={acknowledgment ? "success" : "attention"}>{acknowledgment ? `Acknowledged ${date(acknowledgment.acknowledgedAt!)}` : "Awaiting acknowledgment"}</StatusBadge></li>;
            })}</ul>
          </WorkspacePanel>

          <WorkspacePanel title="Evidence" description="Append-only source records; no diagnosis or finding is inferred." className="mt-5">
            {!detail.evidence.length ? <p className="text-sm text-muted-foreground">No evidence records yet.</p> : <ul className="space-y-3 text-sm">{detail.evidence.map(item => <li key={item.id} className="rounded-lg border p-3"><span className="font-medium">{item.type}</span> · {date(item.createdAt)}<p className="mt-1 whitespace-pre-wrap">{item.description}</p></li>)}</ul>}
            <SafeguardingEvidenceForm incidentId={selectedId} onSaved={refresh} />
          </WorkspacePanel>

          <WorkspacePanel title="Independent external-report history" description="Attempts, submissions and agency acknowledgments are distinct person-attested records." className="mt-5">
            {!detail.externalReports.length ? <p className="text-sm text-muted-foreground">No outside action has been recorded. This says nothing about whether a legal duty applies.</p> : <ul className="space-y-3 text-sm">{detail.externalReports.map(item => <li key={item.id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{item.status.replaceAll("_", " ")} · {item.agencyLabel}</span><span>{date(item.occurredAt)}</span></div><p className="mt-1 text-muted-foreground">{item.channel}{item.reference ? ` · Reference ${item.reference}` : ""}</p>{item.details && <p className="mt-2 whitespace-pre-wrap">{item.details}</p>}</li>)}</ul>}
          </WorkspacePanel>
          <SafeguardingExternalReportForm incidentId={selectedId} onSaved={refresh} />
        </>}
      </QueryState>
    </div>
  </div>;
}
