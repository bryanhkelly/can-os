import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, QueryState, StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  acknowledgeAssignedSafeguardingConcern,
  assignRestrictedSafeguardingReview,
  claimOverdueSafeguardingCaseResponse,
  completeAssignedSafeguardingReview,
  escalateAssignedSafeguardingConcern,
  getAssignedSafeguardingCase,
  getMySafeguardingWorkspace,
  getOverdueUnacknowledgedSafeguardingCases,
  resolveAssignedSafeguardingConcern,
} from "@/modules/safeguarding/safeguarding.functions";
import { SafeguardingEvidenceForm, SafeguardingExternalReportForm } from "./safeguarding-forms";

type Workspace = Awaited<ReturnType<typeof getMySafeguardingWorkspace>>;
type ResponderWorkspace = Extract<Workspace, { mode: "responder" }>;
type CaseDetail = Awaited<ReturnType<typeof getAssignedSafeguardingCase>>;
type OverdueList = Awaited<ReturnType<typeof getOverdueUnacknowledgedSafeguardingCases>>["overdue"];
const date = (value: Date | string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const name = (row: { preferredName: string | null; legalFirstName: string; legalLastName: string }) => row.preferredName ?? `${row.legalFirstName} ${row.legalLastName}`;

export function SafeguardingResponder({ workspace, initialCaseId, reload }: {
  workspace: ResponderWorkspace;
  initialCaseId?: string;
  reload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(initialCaseId ?? "");
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [overdue, setOverdue] = useState<OverdueList>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resolution, setResolution] = useState("");
  const [reviewOutcomes,setReviewOutcomes] = useState<Record<string,string>>({});
  const [reviewDraftId,setReviewDraftId]=useState(()=>crypto.randomUUID());
  const [reviewerId,setReviewerId]=useState("");
  const [reviewNotes,setReviewNotes]=useState("");
  const [reviewKind,setReviewKind]=useState<"protective_measure_review"|"external_reporting_review"|"follow_up_review">("follow_up_review");

  const openCase = useCallback(async (incidentId: string) => {
    setSelectedId(incidentId); setLoading(true); setError(""); setNotice(""); setResolution("");
    setReviewDraftId(crypto.randomUUID());setReviewerId("");setReviewNotes("");
    try { setDetail(await getAssignedSafeguardingCase({ data: { incidentId } })); }
    catch (cause) { setDetail(null); setError(cause instanceof Error ? cause.message : "This restricted case cannot be opened."); }
    finally { setLoading(false); }
  }, []);

  const loadOverdue = useCallback(async () => {
    // The overdue safety net is advisory to the assigned-case list; a failure
    // here must never hide the responder's own assigned cases.
    try { setOverdue((await getOverdueUnacknowledgedSafeguardingCases()).overdue); }
    catch { /* assigned cases remain authoritative */ }
  }, []);

  useEffect(() => {
    if (!initialCaseId) return;
    const task = window.setTimeout(() => void openCase(initialCaseId), 0);
    return () => window.clearTimeout(task);
  }, [initialCaseId, openCase]);

  useEffect(() => { void loadOverdue(); }, [loadOverdue]);

  async function refresh() { await reload(); await loadOverdue(); if (selectedId) await openCase(selectedId); }

  async function command(kind: "acknowledge" | "escalate") {
    if (!selectedId || busy) return;
    setBusy(kind); setError(""); setNotice("");
    try {
      if (kind === "acknowledge") {
        await acknowledgeAssignedSafeguardingConcern({ data: { incidentId: selectedId } });
        setNotice("Your human acknowledgment is recorded. It is not an outside-agency report.");
      } else {
        const result = await escalateAssignedSafeguardingConcern({ data: { incidentId: selectedId } });
        setNotice(result.unroutable
          ? "No currently eligible deputy or CAN fallback can receive this handoff. The case remains open; use the configured offline escalation procedure and arrange authorized coverage."
          : result.escalated ? "Currently eligible deputy and CAN fallback responders have been assigned where not already active."
          : "Currently eligible fallback coverage is already assigned; no duplicate escalation was created.");
      }
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The response update was not saved."); }
    finally { setBusy(""); }
  }

  async function claim(incidentId: string) {
    if (busy) return;
    setBusy("claim:" + incidentId); setError(""); setNotice("");
    try {
      const result = await claimOverdueSafeguardingCaseResponse({ data: { incidentId } });
      setNotice("You are now the named " + result.responsibility.replaceAll("_", " ") +
        " responder for this case. Record your human acknowledgment, then review the facts.");
      await refresh();
      await openCase(incidentId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The takeover was not saved."); }
    finally { setBusy(""); }
  }

  async function assignReview(){
    if(!selectedId||busy)return;
    setBusy("assign-review");setError("");setNotice("");
    try{
      await assignRestrictedSafeguardingReview({data:{incidentId:selectedId,reviewId:reviewDraftId,
        reviewerPersonId:reviewerId,kind:reviewKind,notes:reviewNotes}});
      setReviewDraftId(crypto.randomUUID());setReviewNotes("");
      setNotice("Internal review assigned without granting new case access.");
      await refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"The review assignment was not saved.");}
    finally{setBusy("");}
  }

  async function completeReview(reviewId:string){
    if(!selectedId||busy)return;
    setBusy("review:"+reviewId);setError("");setNotice("");
    try{
      await completeAssignedSafeguardingReview({data:{incidentId:selectedId,reviewId,outcome:reviewOutcomes[reviewId]??""}});
      setNotice("Internal review outcome recorded. External reporting duties remain separate.");
      await refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"The review outcome was not saved.");}
    finally{setBusy("");}
  }

  async function closeCase() {
    if (!selectedId || busy) return;
    setBusy("close"); setError(""); setNotice("");
    try {
      const result = await resolveAssignedSafeguardingConcern({ data: { incidentId: selectedId, resolutionSummary: resolution } });
      setNotice(result.replayed
        ? "This case was already closed under your name; the existing closure record is preserved."
        : "Case closed. Every record is preserved, and closure does not complete or replace any external reporting duty.");
      setResolution("");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The closure was not saved."); }
    finally { setBusy(""); }
  }

  return <div className="grid gap-6 lg:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
    <section aria-label="Assigned safeguarding cases">
      <h2 className="font-serif text-2xl font-semibold">My assigned cases</h2>
      <p className="mt-2 text-sm text-muted-foreground">Site membership alone grants no access. Only active named assignments appear.</p>
      {!workspace.cases.length ? <EmptyState title="No assigned safeguarding cases" description="Ordinary support referrals and unassigned incidents are not available in this workspace." /> : <div className="mt-4 space-y-3">{workspace.cases.map(item => <button key={item.incidentId} type="button" onClick={() => void openCase(item.incidentId)} aria-pressed={selectedId === item.incidentId} className={"w-full rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (selectedId === item.incidentId ? "bg-muted" : "bg-card")}>
        <span className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{item.incidentNumber}</span><StatusBadge tone={item.status === "closed" ? "neutral" : item.urgent ? "danger" : item.acknowledgedAt ? "success" : "attention"}>{item.status === "closed" ? "Closed" : item.urgent ? "Urgent" : item.acknowledgedAt ? "Acknowledged" : "Needs response"}</StatusBadge></span>
        <span className="mt-2 block text-xs text-muted-foreground">{item.responsibility.replaceAll("_", " ")} · reported {date(item.reportedAt)}</span>
        <span className="mt-1 block text-xs">{item.concernKinds.map(kind => kind.replaceAll("_", " ")).join(", ")}</span>
      </button>)}</div>}
      {overdue.length > 0 && <div className="mt-6" aria-label="Unacknowledged cases past their response target">
        <h3 className="text-sm font-semibold">Unacknowledged past response target</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Restricted cases at your site whose acknowledgment target passed with no recorded human
          response. Taking over creates your real named assignment; case content stays restricted
          until it exists. This is never a substitute for the offline emergency procedure.
        </p>
        <div className="mt-3 space-y-3">{overdue.map(item =>
          <div key={item.incidentId} className="rounded-xl border border-rose-300 p-4">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{item.incidentNumber}</span>
              <StatusBadge tone={item.urgent ? "danger" : "attention"}>{item.urgent ? "Urgent · overdue" : "Overdue"}</StatusBadge>
            </span>
            <span className="mt-2 block text-xs text-muted-foreground">
              Reported {date(item.reportedAt)} · response target was {date(item.acknowledgmentDueAt)}
            </span>
            <Button className="mt-3" variant="outline" disabled={!!busy}
              onClick={() => void claim(item.incidentId)}>
              {busy === "claim:" + item.incidentId ? "Assigning…" : "Take over response as " + item.claimResponsibility.replaceAll("_", " ")}
            </Button>
          </div>)}
        </div>
      </div>}
    </section>
    <div className="min-w-0">
      <QueryState loading={loading ? "Loading assigned restricted case…" : undefined} error={error || undefined} isEmpty={!selectedId && !loading} empty={<EmptyState title="Select an assigned case" description="Opening a case checks your current capability, scope and named assignment and records a sensitive-read audit." />}>
        {detail && <>
          <WorkspacePanel title={detail.incident.incidentNumber} description={`Reported ${date(detail.incident.reportedAt)} · ${detail.concern.urgent ? "Urgent human review" : "Restricted safeguarding response"}`} actions={<StatusBadge tone={detail.incident.status === "closed" ? "neutral" : "danger"}>{detail.incident.status === "closed" ? "Closed" : "Restricted"}</StatusBadge>}>
            {detail.incident.status !== "closed" && <div className="flex flex-wrap gap-2">
              <Button disabled={!!busy} onClick={() => void command("acknowledge")}>{busy === "acknowledge" ? "Recording…" : "Acknowledge human response"}</Button>
              <Button variant="outline" disabled={!!busy} onClick={() => void command("escalate")}>{busy === "escalate" ? "Escalating…" : "Escalate to fallback"}</Button>
            </div>}
            {detail.incident.status === "closed" && <WorkspaceNotice tone="success" className="mt-2">
              This case is closed{detail.incident.closedAt ? ` as of ${date(detail.incident.closedAt)}` : ""}. All evidence, acknowledgment and external-report records remain preserved, and closure does not complete or replace any outside-agency legal duty.
              {detail.incident.resolutionSummary ? <span className="mt-2 block whitespace-pre-wrap">Resolution summary: {detail.incident.resolutionSummary}</span> : null}
            </WorkspaceNotice>}
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

          {detail.incident.status==="filed"&&<WorkspacePanel title="Assign an internal case review"
            description="Record reviews identified by the authorized case response. A review assignment grants no new case access and does not determine legal reporting requirements." className="mt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Review type
                <select value={reviewKind} onChange={event=>setReviewKind(event.target.value as typeof reviewKind)} className="mt-1 w-full rounded border bg-background p-2">
                  <option value="follow_up_review">Follow-up review</option>
                  <option value="protective_measure_review">Protective-measure review</option>
                  <option value="external_reporting_review">External-reporting review</option>
                </select>
              </label>
              <label className="text-sm">Assigned case responder
                <select value={reviewerId} onChange={event=>setReviewerId(event.target.value)} className="mt-1 w-full rounded border bg-background p-2">
                  <option value="">Choose an assigned responder</option>
                  {[...new Map(detail.assignments.filter(row=>!row.revokedAt).map(row=>[row.personId,row])).values()]
                    .map(row=><option key={row.personId} value={row.personId}>{name(row)}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm">What must be reviewed
              <textarea rows={2} maxLength={2000} value={reviewNotes} onChange={event=>setReviewNotes(event.target.value)}
                className="mt-1 w-full rounded border bg-background p-2"/>
            </label>
            <Button className="mt-3" disabled={!!busy||!reviewerId||reviewNotes.trim().length<10} onClick={()=>void assignReview()}>Assign restricted review</Button>
          </WorkspacePanel>}

          {!!detail.reviews.length&&<WorkspacePanel title="Assigned restricted case reviews"
            description="Pending reviews block closure. Completing an internal review never records an external report or ends a legal duty." className="mt-5">
            <ul className="space-y-3">{detail.reviews.map(review=><li key={review.id} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{review.level.replaceAll("_"," ")} · {review.status}</p>
              {review.notes&&<p className="mt-2 whitespace-pre-wrap">{review.notes}</p>}
              {review.decision&&<p className="mt-2 whitespace-pre-wrap">Outcome: {review.decision}</p>}
              {review.canComplete&&<>
                <label className="mt-3 block text-sm">Your factual review outcome
                  <textarea rows={2} maxLength={2000} value={reviewOutcomes[review.id]??""}
                    onChange={event=>setReviewOutcomes(values=>({...values,[review.id]:event.target.value}))}
                    className="mt-1 w-full rounded border bg-background p-2"/>
                </label>
                <Button className="mt-2" disabled={!!busy||(reviewOutcomes[review.id]??"").trim().length<10}
                  onClick={()=>void completeReview(review.id)}>Complete assigned review</Button>
              </>}
            </li>)}</ul>
          </WorkspacePanel>}

          {detail.incident.status !== "closed" && <WorkspacePanel title="Accountable closure" description="Closing ends the active internal response. Every record stays intact, and closure never completes or replaces an external legal reporting duty." className="mt-5">
            <label className="block text-sm font-semibold">
              Factual resolution summary (required)
              <textarea value={resolution} maxLength={2000} rows={4}
                onChange={event => setResolution(event.target.value)}
                placeholder="What was actually done, by whom, and what — if anything — remains outstanding?"
                className="mt-2 w-full rounded border bg-background p-3 text-sm font-normal" />
            </label>
            <Button className="mt-3" disabled={!!busy || resolution.trim().length < 10 || detail.reviews.some(review=>review.status==="pending")} onClick={() => void closeCase()}>
              {busy === "close" ? "Closing…" : "Close restricted case"}
            </Button>
          </WorkspacePanel>}
        </>}
      </QueryState>
    </div>
  </div>;
}
