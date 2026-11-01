import { useCallback, useEffect, useState } from "react";
import { StatusBadge, WorkspacePanel } from "@/components/workspace";
import {
  createPickupCustodyHold,
  getOnsitePickupRoster,
  recordDeniedPickup,
  recordUncollectedChild,
  recordVerifiedPickupRelease,
  resolvePickupCustodyHold,
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
    void load();
  }, [load]);

  async function run(key: string, message: string, command: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await command();
      setNotice(message);
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pickup command could not be recorded");
    } finally {
      setBusy("");
    }
  }

  return <WorkspacePanel id="pickup" title="Verified pickup & custody release"
    description="Match the adult to current family authority, verify identity, and personally witness the handoff. A denied attempt is not a release."
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
              {roster.canResolveHolds && <label className="mt-3 block text-xs font-semibold">Resolution note
                <textarea rows={2} maxLength={2000} value={resolutions[hold.id] ?? ""}
                  onChange={event => setResolutions(current => ({ ...current, [hold.id]: event.target.value }))}
                  className="mt-1 w-full rounded border bg-background p-2" />
              </label>}
              {roster.canResolveHolds && <button type="button" disabled={!!busy}
                className="mt-2 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => void run(hold.id, "Custody hold resolved.", () => resolvePickupCustodyHold({ data: {
                  holdId: hold.id,
                  resolutionNote: resolutions[hold.id] ?? "",
                  mutationId: crypto.randomUUID(),
                } }))}>Resolve hold</button>}
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
                onClick={() => void run(key, `Verified release recorded for ${student.studentName}.`, () => recordVerifiedPickupRelease({ data: {
                  date,
                  studentProfileId: student.studentProfileId,
                  programId: student.programId,
                  authorizationId: selectedAuth.id,
                  identityVerified: true as const,
                  identityVerificationMethod: selectedAuth.identityVerificationMethod as "government_photo_id" | "school_issued_id",
                  verifiedLegalName: verifiedNames[key] ?? "",
                  handoffEvidence: evidence[key] ?? "",
                  confirmedHandoff: true as const,
                  mutationId: crypto.randomUUID(),
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
                  onClick={() => void run(key + ":deny", `Denied pickup recorded for ${student.studentName}; school supervision continues.`, () => recordDeniedPickup({ data: {
                    date,
                    studentProfileId: student.studentProfileId,
                    programId: student.programId,
                    householdId: denialHouseholds[key] ?? student.householdIds[0] ?? "",
                    presentedName: denialNames[key] ?? "",
                    reason: (denialReasons[key] ?? "not_authorized") as "not_authorized" | "identity_not_verified" | "custody_dispute" | "emergency_hold" | "expired_authorization",
                    identityVerified: false,
                    mutationId: crypto.randomUUID(),
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
                  onClick={() => void run(key + ":hold", `All pickup release held for ${student.studentName}.`, () => createPickupCustodyHold({ data: {
                    studentProfileId: student.studentProfileId,
                    programId: student.programId,
                    householdId: holdHouseholds[key] ?? student.householdIds[0] ?? "",
                    sectionId: student.sectionId ?? undefined,
                    kind: (holdKinds[key] ?? "disputed_custody") as "disputed_custody" | "emergency",
                    reason: holdReasons[key] ?? "",
                    mutationId: crypto.randomUUID(),
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
                  onClick={() => void run(key + ":uncollected", `Uncollected-child follow-up opened for ${student.studentName}.`, () => recordUncollectedChild({ data: {
                    date,
                    studentProfileId: student.studentProfileId,
                    programId: student.programId,
                    dismissalConfirmed: true as const,
                    followUpPlan: followUpPlans[key] ?? "",
                    mutationId: crypto.randomUUID(),
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
