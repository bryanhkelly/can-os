import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge, WorkspacePanel } from "@/components/workspace";
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
  onChanged?: () => void;
}) {
  const [roster, setRoster] = useState<Roster | null>(null);
  // Preserve the server idempotency identity if a witnessed custody command
  // succeeds but its response is lost. A second click must not invent a new event.
  const pendingMutationIds = useRef(new Map<string, string>());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRoster(await getOnsitePickupRoster({ data: { date } }));
    } catch (cause) {
      setRoster(null);
      setError(cause instanceof Error ? cause.message : "Unable to load the verified pickup roster");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setSelected({});
    setEvidence({});
    setVerifiedNames({});
    setNotice("");
    pendingMutationIds.current.clear(); // Never carry observation IDs across dates.
    void load();
  }, [load]);

  async function run(key: string, message: string, command: (mutationId: string) => Promise<unknown>) {
    if (busy) return;
    const mutationId = pendingMutationIds.current.get(key) ?? crypto.randomUUID();
    pendingMutationIds.current.set(key, mutationId);
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await command(mutationId);
      // Only a confirmed response retires an idempotency identity. A subsequent
      // independent observed event may then receive its own new request ID.
      pendingMutationIds.current.delete(key);
      setNotice(message);
      await load();
      onChanged?.();
    } catch (cause) {
      // Server writes may have committed before a network error. Keep this ID
      // for a same-payload retry rather than creating a second child event.
      setError((cause instanceof Error ? cause.message : "Pickup command could not be confirmed") +
        " The result may be saved. Refresh the roster and retry with identical details; the retry will reuse the original request ID.");
    } finally {
      setBusy("");
    }
  }

  return <WorkspacePanel id="pickup" title="Verified pickup & custody release"
    description="Match the adult to current family authority, verify identity, and personally witness the handoff. A denied attempt is not a release. Custody disputes require verified staff-directed family contact, not a broadcast."
    className="mt-9">
    {notice && <p role="status" className="mb-4 rounded border p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded border p-3 text-sm">{error}</p>}
    {loading && <p role="status" className="text-sm">Loading family release authority…</p>}
    {!loading && roster && <>
      <p className="mb-5 text-xs text-muted-foreground">{roster.note}</p>
      {!roster.canRecordPickupObservations && <p role="status" className="mb-5 rounded border p-3 text-sm">
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
            className="rounded-xl border p-4">
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

            {student.emergencyContact?.phone && <div className="mt-4 rounded-lg border p-3 text-sm">
              <p className="font-semibold">School-approved emergency contact</p>
              <p className="mt-1">{student.emergencyContact.name} · {student.emergencyContact.relationship}</p>
              <p className="mt-1"><a className="font-semibold underline" href={"tel:"+student.emergencyContact.phone}>{student.emergencyContact.phone}</a></p>
              <p className="mt-2 text-xs text-muted-foreground">Emergency contact only. This does not authorize pickup or override custody restrictions.</p>
            </div>}

            {student.release && <div className="mt-4 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
              <p className="font-semibold">Verified handoff to {student.release.pickupName}</p>
              <p className="mt-1">{new Date(student.release.occurredAt).toLocaleString()} · {student.release.identityVerificationMethod?.replaceAll("_", " ")}</p>
              <p className="mt-2 text-xs">{student.release.handoffEvidence}</p>
            </div>}

            {student.activeHolds.map(hold => <div key={hold.id}
              className="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm">
              <p className="font-semibold">{hold.kind === "emergency" ? "Emergency hold" : "Disputed custody hold"}</p>
              <p className="mt-1">{hold.reason}</p>
              {roster.canProposeHoldResolution && !hold.pendingResolution && <>
                <p className="mt-2 text-xs">Only an authorized Site director may independently approve a proposal from a separately verified onsite staff member. This form does not clear the hold.</p>
                <label className="mt-3 block text-xs font-semibold">Resolution note
                  <textarea rows={2} maxLength={2000} value={resolutions[hold.id] ?? ""}
                    onChange={event => setResolutions(current => ({...current, [hold.id]: event.target.value}))}
                    className="mt-1 w-full rounded border bg-background p-2" />
                </label>
                <label className="mt-2 block text-xs">Documented authority basis
                  <select className="mt-1 block w-full rounded border bg-background p-2"
                    value={resolutionBases[hold.id] ?? (hold.kind === "emergency" ? "documented_emergency_cleared" : "verified_court_order")}
                    onChange={event => setResolutionBases(current => ({...current, [hold.id]: event.target.value}))}>
                    {hold.kind === "emergency"
                      ? <option value="documented_emergency_cleared">Verified emergency clearance</option>
                      : <>
                        <option value="verified_court_order">Verified court order</option>
                        <option value="verified_guardian_instructions">Verified guardian instructions</option>
                      </>}
                  </select>
                </label>
                <label className="mt-2 block text-xs">Verified case or document reference
                  <input maxLength={500} value={resolutionReferences[hold.id] ?? ""}
                    onChange={event => setResolutionReferences(current => ({...current, [hold.id]: event.target.value}))}
                    className="mt-1 block w-full rounded border bg-background p-2" />
                </label>
                <button type="button"
                  disabled={!!busy || (resolutions[hold.id] ?? "").trim().length < 20 ||
                    (resolutionReferences[hold.id] ?? "").trim().length < 15}
                  className="mt-2 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
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
                    } }))}>Propose release for independent review</button>
              </>}
              {roster.canResolveHolds && hold.pendingResolution && <>
                <p className="mt-2 text-xs font-semibold">Pending independent review</p>
                <p className="mt-1 text-xs">Basis: {hold.pendingResolution.authorityBasis.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs">Reference: {hold.pendingResolution.evidenceReference}</p>
                <p className="mt-1 text-xs">Proposal: {hold.pendingResolution.resolutionNote}</p>
                {hold.pendingResolution.proposerPersonId !== roster.reviewerPersonId
                  ? <button type="button" disabled={!!busy}
                      className="mt-2 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      onClick={() => void run(hold.id + ":resolve", "Independent release approved; hold cleared.",
                        mutationId => resolvePickupCustodyHold({ data: {
                          holdId: hold.id,
                          proposalId: hold.pendingResolution!.id,
                          resolutionNote: hold.pendingResolution!.resolutionNote,
                          mutationId,
                        } }))}>Independently approve and clear hold</button>
                  : <p className="mt-2 text-xs">You cannot approve your own proposal. A separately authorized Site director must review.</p>}
              </>}
            </div>)}

            {!student.release && <div className="mt-4">
              <h4 className="text-sm font-semibold">Family-authorized adults for this date</h4>
              {!student.authorizedAdults.length && <p className="mt-2 text-sm text-muted-foreground">No current authorization. Do not release this child.</p>}
              <div className="mt-2 grid gap-2">
                {student.authorizedAdults.map(adult => <button key={adult.id} type="button"
                  disabled={!!busy || !canAttempt || activeHold}
                  onClick={() => {
                    setSelected(current => ({ ...current, [key]: adult.id }));
                    setVerifiedNames(current => ({ ...current, [key]: adult.pickupName }));
                  }}
                  className="rounded border px-3 py-2 text-left text-sm disabled:opacity-50 aria-pressed:bg-muted"
                  aria-pressed={selected[key] === adult.id}>
                  <span className="font-semibold">{adult.pickupName}</span>
                  <span className="block text-xs text-muted-foreground">{adult.relationshipLabel} · require {adult.identityVerificationMethod.replaceAll("_", " ")}</span>
                </button>)}
              </div>
            </div>}

            {selectedAuth && canAttempt && !activeHold && <div className="mt-4 rounded-lg bg-muted/40 p-3">
              <h4 className="text-sm font-semibold">Witness release to {selectedAuth.pickupName}</h4>
              <label className="mt-3 block text-xs font-semibold">Legal name verified on required credential
                <input value={verifiedNames[key] ?? ""} maxLength={201}
                  onChange={event => setVerifiedNames(current => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 w-full rounded border bg-background p-2 text-sm" />
              </label>
              <label className="mt-3 block text-xs font-semibold">Handoff evidence
                <textarea rows={2} maxLength={2000} value={evidence[key] ?? ""}
                  placeholder="What you checked and observed; never enter a document number"
                  onChange={event => setEvidence(current => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 w-full rounded border bg-background p-2 text-sm" />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">By recording this command you attest that you checked the required credential, matched the adult, and personally witnessed the handoff.</p>
              <button type="button" disabled={!!busy}
                className="mt-3 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
                } }))}>Record verified release</button>
            </div>}

            {canAttempt && <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <details className="rounded border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Record denied pickup</summary>
                <label className="mt-3 block text-xs">Presented name
                  <input value={denialNames[key] ?? ""} maxLength={201}
                    onChange={event => setDenialNames(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2" />
                </label>
                <label className="mt-2 block text-xs">Household context
                  <select value={denialHouseholds[key] ?? student.householdIds[0] ?? ""}
                    onChange={event => setDenialHouseholds(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2">
                    {student.householdIds.map(id => <option key={id} value={id}>{id}</option>)}
                  </select>
                </label>
                <label className="mt-2 block text-xs">Denial reason
                  <select value={denialReasons[key] ?? "not_authorized"}
                    onChange={event => setDenialReasons(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2">
                    <option value="not_authorized">Not authorized</option>
                    <option value="identity_not_verified">Identity not verified</option>
                    <option value="custody_dispute">Disputed custody</option>
                    <option value="emergency_hold">Emergency hold</option>
                    <option value="expired_authorization">Expired authorization</option>
                  </select>
                </label>
                <button type="button" disabled={!!busy || !student.householdIds.length}
                  className="mt-3 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  onClick={() => void run(key + ":deny", `Denied pickup recorded for ${student.studentName}; school supervision continues.`, (mutationId) => recordDeniedPickup({ data: {
                    date,
                    studentProfileId: student.studentProfileId,
                    programId: student.programId,
                    householdId: denialHouseholds[key] ?? student.householdIds[0] ?? "",
                    presentedName: denialNames[key] ?? "",
                    reason: (denialReasons[key] ?? "not_authorized") as "not_authorized" | "identity_not_verified" | "custody_dispute" | "emergency_hold" | "expired_authorization",
                    identityVerified: false,
                    mutationId,
                  } }))}>Record denial — no release</button>
              </details>

              <details className="rounded border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Create custody / emergency hold</summary>
                <label className="mt-3 block text-xs">Hold type
                  <select value={holdKinds[key] ?? "disputed_custody"}
                    onChange={event => setHoldKinds(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2">
                    <option value="disputed_custody">Disputed custody</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </label>
                <label className="mt-2 block text-xs">Household context
                  <select value={holdHouseholds[key] ?? student.householdIds[0] ?? ""}
                    onChange={event => setHoldHouseholds(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2">
                    {student.householdIds.map(id => <option key={id} value={id}>{id}</option>)}
                  </select>
                </label>
                <label className="mt-2 block text-xs">Safety reason
                  <textarea rows={2} maxLength={2000} value={holdReasons[key] ?? ""}
                    onChange={event => setHoldReasons(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2" />
                </label>
                <button type="button" disabled={!!busy || !student.householdIds.length}
                  className="mt-3 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  onClick={() => void run(key + ":hold", `All pickup release held for ${student.studentName}.`, (mutationId) => createPickupCustodyHold({ data: {
                    studentProfileId: student.studentProfileId,
                    programId: student.programId,
                    householdId: holdHouseholds[key] ?? student.householdIds[0] ?? "",
                    sectionId: student.sectionId ?? undefined,
                    kind: (holdKinds[key] ?? "disputed_custody") as "disputed_custody" | "emergency",
                    reason: holdReasons[key] ?? "",
                    mutationId,
                  } }))}>Block all release</button>
              </details>

              <details className="rounded border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Uncollected-child follow-up</summary>
                <label className="mt-3 block text-xs">Supervision and family contact plan
                  <textarea rows={3} maxLength={2000} value={followUpPlans[key] ?? ""}
                    onChange={event => setFollowUpPlans(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2" />
                </label>
                <button type="button" disabled={!!busy || !!student.uncollectedActionId}
                  className="mt-3 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  onClick={() => void run(key + ":uncollected", `Uncollected-child follow-up opened for ${student.studentName}.`, (mutationId) => recordUncollectedChild({ data: {
                    date,
                    studentProfileId: student.studentProfileId,
                    programId: student.programId,
                    dismissalConfirmed: true as const,
                    followUpPlan: followUpPlans[key] ?? "",
                    mutationId,
                  } }))}>Confirm dismissal & open follow-up</button>
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
      <button type="button" onClick={() => void load()} disabled={!!busy}
        className="mt-5 text-sm underline">Refresh pickup roster</button>
    </>}
  </WorkspacePanel>;
}
