import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { useCallback, useEffect, useRef, useState } from "react";
import { MutationFeedback, SelectionCard, StatCard, StatusBadge, WorkspacePanel } from "@/components/workspace";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createPickupCustodyHold,
  getOnsitePickupRoster,
  recordDeniedPickup,
  recordUncollectedChild,
  recordVerifiedPickupRelease,
  resolvePickupCustodyHold,
  proposePickupCustodyResolution,
} from "@/modules/operations/pickup.functions";

type Roster = Awaited<ReturnType<typeof getOnsitePickupRoster>>;
type Student = Roster["students"][number];
const keyFor = (student: Student) => student.programId + ":" + student.studentProfileId;

/** Staff-only custody surface. Every command revalidates authority server-side. */
export function OnsitePickupPanel({ date, onChanged }: {
  date: string;
  onChanged?: () => Promise<void> | void;
}) {
  const [rosterSnapshot, setRoster] = useState<{ date: string; value: Roster } | null>(null);
  // Even before effects invalidate the previous request, never render a
  // custody roster under a different school's local day.
  const roster = rosterSnapshot?.date === date ? rosterSnapshot.value : null;
  // Preserve the server idempotency identity if a witnessed custody command
  // succeeds but its response is lost. A second click must not invent a new event.
  const pendingMutationIds = useRef(new Map<string, string>());
  const requestSequence = useRef(0);
  const activeDate = useRef(date);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [verifiedNames, setVerifiedNames] = useState<Record<string, string>>({});
  const [denialNames, setDenialNames] = useState<Record<string, string>>({});
  const [denialReasons, setDenialReasons] = useState<Record<string, string>>({});
  const [denialHouseholds, setDenialHouseholds] = useState<Record<string, string>>({});
  const [followUpPlans, setFollowUpPlans] = useState<Record<string, string>>({});
  const [holdReasons, setHoldReasons] = useState<Record<string, string>>({});
  const [holdKinds, setHoldKinds] = useState<Record<string, string>>({});
  const [holdHouseholds, setHoldHouseholds] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [resolutionReferences,setResolutionReferences]=useState<Record<string,string>>({});
  const [resolutionBases,setResolutionBases]=useState<Record<string,string>>({});

  const load = useCallback(async (propagateFailure = false) => {
    if (date !== activeDate.current) {
      if (propagateFailure) throw new Error("Pickup roster date changed; retry refresh.");
      return;
    }
    const request = ++requestSequence.current;
    setLoading(true);
    setError("");
    setRoster(null); // Never permit actions against an unverified, previous-date roster.
    try {
      const next = await getOnsitePickupRoster({ data: { date } });
      if (request !== requestSequence.current || date !== activeDate.current) {
        if (propagateFailure) throw new Error("Pickup roster context changed; retry refresh.");
        return;
      }
      setRoster({ date, value: next });
    } catch (cause) {
      if (request === requestSequence.current && date === activeDate.current) {
        setRoster(null);
        setError(mutationErrorMessage(cause, "Unable to load the verified pickup roster"));
      }
      // Mutation feedback requires a rejection when its authoritative
      // post-command refresh fails. UI refreshes render their own error.
      if (propagateFailure) throw cause;
    } finally {
      if (request === requestSequence.current && date === activeDate.current) setLoading(false);
    }
  }, [date]);
  const refreshAfterChange = useCallback(async () => {
    await load(true);
    await onChanged?.();
  }, [load, onChanged]);
  const mutation = useMutationFeedback(refreshAfterChange);
  const busy = mutation.pending || mutation.refreshFailed;

  useEffect(() => {
    activeDate.current = date;
    // These drafts describe witnessed child custody events. Never carry them
    // into another date or retain a previous day's authorized adults.
    setSelected({});
    setEvidence({});
    setVerifiedNames({});
    setDenialNames({});
    setDenialReasons({});
    setDenialHouseholds({});
    setFollowUpPlans({});
    setHoldReasons({});
    setHoldKinds({});
    setHoldHouseholds({});
    setResolutions({});
    setResolutionReferences({});
    setResolutionBases({});
    pendingMutationIds.current.clear(); // Never carry observation IDs across dates.
    void load();
    return () => { requestSequence.current++; };
  }, [load]);

  async function run(key: string, message: string, command: (mutationId: string) => Promise<unknown>) {
    if (busy) return;
    const mutationId = pendingMutationIds.current.get(key) ?? crypto.randomUUID();
    pendingMutationIds.current.set(key, mutationId);
    setError("");
    const outcome=await mutation.run(()=>command(mutationId),{
      successMessage:message,
      commandErrorMessage:"Pickup command could not be confirmed.",
      refreshErrorMessage:"The pickup command was accepted, but the verified roster could not be refreshed. Retry the refresh before recording another event.",
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      // Only a confirmed response retires an idempotency identity. A subsequent
      // independent observed event may then receive its own new request ID.
      pendingMutationIds.current.delete(key);
    }else if(outcome.status==="failed"){
      // Server writes may have committed before a network error. Keep this ID
      // for a same-payload retry rather than creating a second child event.
      setError((mutationErrorMessage(outcome.error, "Pickup command could not be confirmed")) +
        " The result may be saved. Refresh the roster and retry with identical details; the retry will reuse the original request ID.");
    }
  }
  async function retryRefresh(){
    const outcome=await mutation.retryRefresh();
    if(outcome.status==="refreshed"){
      setError("");
    }
    return outcome;
  }

  return <WorkspacePanel id="pickup" title="Verified pickup & custody release"
    description="Match the adult to current family authority, verify identity, and personally witness the handoff. A denied attempt is not a release. Custody disputes require verified staff-directed family contact, not a broadcast."
    className="mt-9">
    {error && <p role="alert" className="mb-4 border p-3 text-sm">{error}</p>}
    <MutationFeedback state={{...mutation,retryRefresh}} className="mb-4" pendingMessage="Updating verified pickup records…"/>
    <Button variant="outline" type="button" disabled={loading||busy} onClick={()=>void load()}
      className="mb-4">Refresh verified roster</Button>
    {loading && <p role="status" className="text-sm">Loading family release authority…</p>}
    {!loading && roster && <>
      <p className="mb-5 text-xs text-muted-foreground">{roster.note}</p>
      <section aria-label="Pickup overview" className="mb-6 border bg-muted/20 p-4">
        <h3 className="font-semibold">Dismissal overview</h3>
        <p className="mt-1 text-xs text-muted-foreground">Current verified pickup roster only. Counts are student-program entries, not a deduplicated headcount or permission to release anyone.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <StatCard label="Roster entries" value={roster.students.length}/>
          <StatCard label="Verified releases" value={roster.students.filter(s=>Boolean(s.release)).length}/>
          <StatCard label="Release holds" value={roster.students.filter(s=>s.activeHolds.length>0&&!s.release).length}/>
          <StatCard label="Present or tardy, not released" value={roster.students.filter(s=>["present","tardy"].includes(s.status)&&!s.release).length}/>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">An unreleased record does not establish a child is still physically present. Verify current observed facts and custody authority before any action.</p>
      </section>
      {!roster.canRecordPickupObservations && <p role="status" className="mb-5 border p-3 text-sm">
        Historical school-day record: no new pickup release, denial or dismissal observation can be recorded for this date.
        Return to Operate today to witness a current handoff. Existing custody holds and urgent safety reporting remain separate.
      </p>}
      {!roster.students.length && <p className="text-sm">No students in the current scoped onsite roster.</p>}
      <div className="grid gap-5">
        {roster.students.map(student => {
          const key = keyFor(student);
          const selectedAuth = student.authorizedAdults.find(row => row.id === selected[key]);
          const activeHold = student.activeHolds.length > 0;
          const canAttempt = roster.canRecordPickupObservations &&
            ["present", "tardy"].includes(student.status) && !student.release;
          return <section key={key} aria-label={`Pickup for ${student.studentName}`}
            className="border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold">{student.studentName}</h3>
                <p className="text-xs text-muted-foreground">{student.programName} · {student.sectionTitle ?? "Program roster"}</p></div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={student.release ? "success" : activeHold ? "danger" : "neutral"}>
                  {student.release ? "Released" : activeHold ? "Release held" : student.status.replaceAll("_", " ")}
                </StatusBadge>
                {student.uncollectedActionId && <StatusBadge tone="attention">Follow-up open</StatusBadge>}
              </div>
            </div>

            {student.emergencyContact?.phone && <div className="mt-4 border p-3 text-sm">
              <p className="font-semibold">School-approved emergency contact</p>
              <p className="mt-1">{student.emergencyContact.name} · {student.emergencyContact.relationship}</p>
              <p className="mt-1"><a className="font-semibold underline" href={"tel:"+student.emergencyContact.phone}>{student.emergencyContact.phone}</a></p>
              <p className="mt-2 text-xs text-muted-foreground">Emergency contact only. This does not authorize pickup or override custody restrictions.</p>
            </div>}

            {student.release && <div className="mt-4 border border-success/40 bg-success/5 p-3 text-sm">
              <p className="font-semibold">Verified handoff to {student.release.pickupName}</p>
              <p className="mt-1">{new Date(student.release.occurredAt).toLocaleString()} · {student.release.identityVerificationMethod?.replaceAll("_", " ")}</p>
              <p className="mt-2 text-xs">{student.release.handoffEvidence}</p>
            </div>}

            {student.activeHolds.map(hold => <div key={hold.id}
              className="mt-4 border border-danger/40 bg-danger/5 p-3 text-sm">
              <p className="font-semibold">{hold.kind === "emergency" ? "Emergency hold" : "Disputed custody hold"}</p>
              <p className="mt-1">{hold.reason}</p>
              {roster.canProposeHoldResolution && !hold.pendingResolution && <>
                <p className="mt-2 text-xs">Only an authorized Site director may independently approve a proposal from a separately verified onsite staff member. This form does not clear the hold.</p>
                <Label className="mt-3 block text-xs font-semibold">Resolution note
                  <Textarea rows={2} maxLength={2000} value={resolutions[hold.id] ?? ""}
                    onChange={event => setResolutions(current => ({...current, [hold.id]: event.target.value}))}
                    className="mt-1" />
                </Label>
                <Label className="mt-2 block text-xs">Documented authority basis
                  <Select className="mt-1"
                    value={resolutionBases[hold.id] ?? (hold.kind === "emergency" ? "documented_emergency_cleared" : "verified_court_order")}
                    onChange={event => setResolutionBases(current => ({...current, [hold.id]: event.target.value}))}>
                    {hold.kind === "emergency"
                      ? <option value="documented_emergency_cleared">Verified emergency clearance</option>
                      : <>
                        <option value="verified_court_order">Verified court order</option>
                        <option value="verified_guardian_instructions">Verified guardian instructions</option>
                      </>}
                  </Select>
                </Label>
                <Label className="mt-2 block text-xs">Verified case or document reference
                  <Input maxLength={500} value={resolutionReferences[hold.id] ?? ""}
                    onChange={event => setResolutionReferences(current => ({...current, [hold.id]: event.target.value}))}
                    className="mt-1" />
                </Label>
                <Button variant="outline" type="button"
                  disabled={!!busy || (resolutions[hold.id] ?? "").trim().length < 20 ||
                    (resolutionReferences[hold.id] ?? "").trim().length < 15}
                  className="mt-2"
                  onClick={() => void run(hold.id + ":propose", "Resolution proposed for independent review.",
                    mutationId => proposePickupCustodyResolution({ data: {
                      holdId: hold.id,
                      mutationId,
                      sectionId: student.sectionId ?? undefined,
                      resolutionNote: resolutions[hold.id] ?? "",
                      authorityBasis: (resolutionBases[hold.id] ??
                        (hold.kind === "emergency" ? "documented_emergency_cleared" : "verified_court_order")) as
                        "verified_court_order" | "verified_guardian_instructions" | "documented_emergency_cleared",
                      evidenceReference: resolutionReferences[hold.id] ?? "",
                    } }))}>Propose release for independent review</Button>
              </>}
              {roster.canResolveHolds && hold.pendingResolution && <>
                <p className="mt-2 text-xs font-semibold">Pending independent review</p>
                <p className="mt-1 text-xs">Basis: {hold.pendingResolution.authorityBasis.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs">Reference: {hold.pendingResolution.evidenceReference}</p>
                <p className="mt-1 text-xs">Proposal: {hold.pendingResolution.resolutionNote}</p>
                {hold.pendingResolution.proposerPersonId !== roster.reviewerPersonId
                  ? <Button variant="outline" type="button" disabled={!!busy}
                      className="mt-2"
                      onClick={() => void run(hold.id + ":resolve", "Independent release approved; hold cleared.",
                        mutationId => resolvePickupCustodyHold({ data: {
                          holdId: hold.id,
                          proposalId: hold.pendingResolution!.id,
                          resolutionNote: hold.pendingResolution!.resolutionNote,
                          mutationId,
                        } }))}>Independently approve and clear hold</Button>
                  : <p className="mt-2 text-xs">You cannot approve your own proposal. A separately authorized Site director must review.</p>}
              </>}
            </div>)}

            {!student.release && <div className="mt-4">
              <h4 className="text-sm font-semibold">Family-authorized adults for this date</h4>
              {!student.authorizedAdults.length && <p className="mt-2 text-sm text-muted-foreground">No current authorization. Do not release this child.</p>}
              <div className="mt-2 grid gap-2">
                {student.authorizedAdults.map(adult => <SelectionCard key={adult.id}
                  kind="radio" name={`pickup-adult-${key}`} value={adult.id}
                  checked={selected[key] === adult.id}
                  disabled={!!busy || !canAttempt || activeHold}
                  title={adult.pickupName}
                  detail={`${adult.relationshipLabel} · require ${adult.identityVerificationMethod.replaceAll("_", " ")}`}
                  onChange={checked => {
                    if (!checked) return;
                    setSelected(current => ({ ...current, [key]: adult.id }));
                    setVerifiedNames(current => ({ ...current, [key]: adult.pickupName }));
                  }}
                  className="w-full" />)}

              </div>
            </div>}

            {selectedAuth && canAttempt && !activeHold && <div className="mt-4 bg-muted/40 p-3">
              <h4 className="text-sm font-semibold">Witness release to {selectedAuth.pickupName}</h4>
              <Label className="mt-3 block text-xs font-semibold">Legal name verified on required credential
                <Input value={verifiedNames[key] ?? ""} maxLength={201}
                  onChange={event => setVerifiedNames(current => ({ ...current, [key]: event.target.value }))}
                  className="mt-1" />
              </Label>
              <Label className="mt-3 block text-xs font-semibold">Handoff evidence
                <Textarea rows={2} maxLength={2000} value={evidence[key] ?? ""}
                  placeholder="What you checked and observed; never enter a document number"
                  onChange={event => setEvidence(current => ({ ...current, [key]: event.target.value }))}
                  className="mt-1" />
              </Label>
              <p className="mt-2 text-xs text-muted-foreground">By recording this command you attest that you checked the required credential, matched the adult, and personally witnessed the handoff.</p>
              <Button variant="default" type="button" disabled={!!busy}
                className="mt-3"
                onClick={() => void run(key, `Verified release recorded for ${student.studentName}.`, (mutationId) => recordVerifiedPickupRelease({ data: {
                  date,
                  studentProfileId: student.studentProfileId,
                  programId: student.programId,
                  authorizationId: selectedAuth.id,
                  identityVerified: true as const,
                  identityVerificationMethod: selectedAuth.identityVerificationMethod as "government_photo_id" | "school_issued_id",
                  verifiedLegalName: verifiedNames[key] ?? "",
                  handoffEvidence: evidence[key] ?? "",
                  confirmedHandoff: true as const,
                  mutationId,
                } }))}>Record verified release</Button>
            </div>}

            {canAttempt && <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <details className="border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Record denied pickup</summary>
                <Label className="mt-3 block text-xs">Presented name
                  <Input value={denialNames[key] ?? ""} maxLength={201}
                    onChange={event => setDenialNames(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1" />
                </Label>
                <Label className="mt-2 block text-xs">Household context
                  <Select value={denialHouseholds[key] ?? student.householdIds[0] ?? ""}
                    onChange={event => setDenialHouseholds(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1">
                    {student.householdIds.map(id => <option key={id} value={id}>{id}</option>)}
                  </Select>
                </Label>
                <Label className="mt-2 block text-xs">Denial reason
                  <Select value={denialReasons[key] ?? "not_authorized"}
                    onChange={event => setDenialReasons(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1">
                    <option value="not_authorized">Not authorized</option>
                    <option value="identity_not_verified">Identity not verified</option>
                    <option value="custody_dispute">Disputed custody</option>
                    <option value="emergency_hold">Emergency hold</option>
                    <option value="expired_authorization">Expired authorization</option>
                  </Select>
                </Label>
                <Button variant="outline" type="button" disabled={!!busy || !student.householdIds.length}
                  className="mt-3"
                  onClick={() => void run(key + ":deny", `Denied pickup recorded for ${student.studentName}; school supervision continues.`, (mutationId) => recordDeniedPickup({ data: {
                    date,
                    studentProfileId: student.studentProfileId,
                    programId: student.programId,
                    householdId: denialHouseholds[key] ?? student.householdIds[0] ?? "",
                    presentedName: denialNames[key] ?? "",
                    reason: (denialReasons[key] ?? "not_authorized") as "not_authorized" | "identity_not_verified" | "custody_dispute" | "emergency_hold" | "expired_authorization",
                    identityVerified: false,
                    mutationId,
                  } }))}>Record denial — no release</Button>
              </details>

              <details className="border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Create custody / emergency hold</summary>
                <Label className="mt-3 block text-xs">Hold type
                  <Select value={holdKinds[key] ?? "disputed_custody"}
                    onChange={event => setHoldKinds(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1">
                    <option value="disputed_custody">Disputed custody</option>
                    <option value="emergency">Emergency</option>
                  </Select>
                </Label>
                <Label className="mt-2 block text-xs">Household context
                  <Select value={holdHouseholds[key] ?? student.householdIds[0] ?? ""}
                    onChange={event => setHoldHouseholds(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1">
                    {student.householdIds.map(id => <option key={id} value={id}>{id}</option>)}
                  </Select>
                </Label>
                <Label className="mt-2 block text-xs">Safety reason
                  <Textarea rows={2} maxLength={2000} value={holdReasons[key] ?? ""}
                    onChange={event => setHoldReasons(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1" />
                </Label>
                <Button variant="outline" type="button" disabled={!!busy || !student.householdIds.length}
                  className="mt-3"
                  onClick={() => void run(key + ":hold", `All pickup release held for ${student.studentName}.`, (mutationId) => createPickupCustodyHold({ data: {
                    studentProfileId: student.studentProfileId,
                    programId: student.programId,
                    householdId: holdHouseholds[key] ?? student.householdIds[0] ?? "",
                    sectionId: student.sectionId ?? undefined,
                    kind: (holdKinds[key] ?? "disputed_custody") as "disputed_custody" | "emergency",
                    reason: holdReasons[key] ?? "",
                    mutationId,
                  } }))}>Block all release</Button>
              </details>

              <details className="border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Uncollected-child follow-up</summary>
                <Label className="mt-3 block text-xs">Supervision and family contact plan
                  <Textarea rows={3} maxLength={2000} value={followUpPlans[key] ?? ""}
                    onChange={event => setFollowUpPlans(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1" />
                </Label>
                <Button variant="outline" type="button" disabled={!!busy || !!student.uncollectedActionId}
                  className="mt-3"
                  onClick={() => void run(key + ":uncollected", `Uncollected-child follow-up opened for ${student.studentName}.`, (mutationId) => recordUncollectedChild({ data: {
                    date,
                    studentProfileId: student.studentProfileId,
                    programId: student.programId,
                    dismissalConfirmed: true as const,
                    followUpPlan: followUpPlans[key] ?? "",
                    mutationId,
                  } }))}>Confirm dismissal & open follow-up</Button>
              </details>
            </div>}

            {student.deniedAttempts.length > 0 && <div className="mt-4 text-xs">
              <h4 className="font-semibold">Denied attempts today</h4>
              <ul className="mt-1 space-y-1">
                {student.deniedAttempts.map(attempt => <li key={attempt.id}>
                  {attempt.presentedName} — {attempt.reason?.replaceAll("_", " ")} at {new Date(attempt.occurredAt).toLocaleTimeString()}
                </li>)}
              </ul>
            </div>}
          </section>;
        })}
      </div>
      <Button variant="ghost" type="button" onClick={() => void load()} disabled={!!busy}
        className="mt-5 underline">Refresh pickup roster</Button>
    </>}
  </WorkspacePanel>;
}
