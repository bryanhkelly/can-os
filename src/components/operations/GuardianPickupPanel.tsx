import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge, WorkspacePanel } from "@/components/workspace";
import {
  createPickupAuthorization,
  createPickupCustodyHold,
  getGuardianPickupWorkspace,
  revokePickupAuthorization,
} from "@/modules/operations/pickup.functions";

type Workspace = Awaited<ReturnType<typeof getGuardianPickupWorkspace>>;
type Student = Workspace["students"][number];
const keyFor = (student: Student) => student.programId + ":" + student.studentProfileId + ":" + student.householdId;
// HTML date inputs use local calendar days, not UTC. UTC defaults can silently
// start tomorrow's authorization on the US West Coast in the afternoon.
const todayForPickupInput = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/** Family release-authority management and authorized handoff history. */
export function GuardianPickupPanel({ studentPersonId }: { studentPersonId?: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const pendingMutationIds = useRef(new Map<string, string>());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [firstNames, setFirstNames] = useState<Record<string, string>>({});
  const [lastNames, setLastNames] = useState<Record<string, string>>({});
  const [relationships, setRelationships] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [startDates, setStartDates] = useState<Record<string, string>>({});
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});
  const [revocationReasons, setRevocationReasons] = useState<Record<string, string>>({});
  const [holdReasons, setHoldReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setWorkspace(await getGuardianPickupWorkspace({ data: { studentPersonId } }));
    } catch (cause) {
      setWorkspace(null);
      setError(cause instanceof Error ? cause.message : "Unable to load pickup authority");
    } finally {
      setLoading(false);
    }
  }, [studentPersonId]);

  useEffect(() => {
    setNotice("");
    // Different guardian / child selection must not inherit a pending request.
    pendingMutationIds.current.clear();
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
      pendingMutationIds.current.delete(key);
      setNotice(message);
      await load();
    } catch (cause) {
      // The server may have committed a guardian authorization, revocation or
      // custody hold before the response was lost. Do not create a new event
      // identity until an unchanged retry has been acknowledged.
      setError((cause instanceof Error ? cause.message : "Pickup change could not be confirmed") +
        " The result may already be saved. Refresh pickup history and retry with the same details; the original request ID will be reused.");
    } finally {
      setBusy("");
    }
  }

  return <WorkspacePanel id="pickup" title="Pickup authorization & release history"
    description="Authorize a person by legal name and required identity check. School staff must still verify the adult and witness every handoff."
    className="mt-8">
    {notice && <p role="status" className="mb-4 rounded border p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded border p-3 text-sm">{error}</p>}
    {loading && <p role="status" className="text-sm">Loading pickup authority…</p>}
    {!loading && workspace && <>
      <p className="mb-5 text-xs text-muted-foreground">{workspace.note}</p>
      {!workspace.students.length && <p className="text-sm">No verified guardian pickup relationships are available for the current school scope.</p>}
      <div className="grid gap-5">
        {workspace.students.map(student => {
          const key = keyFor(student);
          const activeHold = student.holds.some(hold => hold.status === "active");
          return <section key={key} className="rounded-xl border p-4" aria-label={`Pickup authority for ${student.studentName}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold">{student.studentName}</h3>
                <p className="text-xs text-muted-foreground">{student.programName}</p></div>
              {activeHold && <StatusBadge tone="danger">All release held</StatusBadge>}
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-semibold">Authorized adults</h4>
              {!student.authorizations.length && <p className="mt-2 text-sm text-muted-foreground">No pickup people have been authorized.</p>}
              <div className="mt-2 grid gap-3">
                {student.authorizations.map(adult => <div key={adult.id} className="rounded border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{adult.pickupName}</p>
                    <StatusBadge tone={adult.status === "active" ? "success" : "neutral"}>{adult.status}</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{adult.relationshipLabel} · {adult.identityVerificationMethod.replaceAll("_", " ")} · {adult.startsOn}{adult.expiresOn ? ` through ${adult.expiresOn}` : " with no expiry"}</p>
                  {adult.status === "active" && <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold">Revoke authorization</summary>
                    <label className="mt-2 block text-xs">Reason
                      <textarea rows={2} maxLength={2000} value={revocationReasons[adult.id] ?? ""}
                        onChange={event => setRevocationReasons(current => ({ ...current, [adult.id]: event.target.value }))}
                        className="mt-1 w-full rounded border bg-background p-2" />
                    </label>
                    <button type="button" disabled={!!busy}
                      className="mt-2 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      onClick={() => void run(adult.id, `Pickup authorization revoked for ${adult.pickupName}.`, (mutationId) => revokePickupAuthorization({ data: {
                        authorizationId: adult.id,
                        reason: revocationReasons[adult.id] ?? "",
                        mutationId,
                      } }))}>Revoke future pickup</button>
                  </details>}
                </div>)}
              </div>
            </div>

            <details className="mt-4 rounded border p-3">
              <summary className="cursor-pointer text-sm font-semibold">Authorize a pickup person</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold">Legal first name
                  <input value={firstNames[key] ?? ""} maxLength={100}
                    onChange={event => setFirstNames(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2 text-sm" />
                </label>
                <label className="text-xs font-semibold">Legal last name
                  <input value={lastNames[key] ?? ""} maxLength={100}
                    onChange={event => setLastNames(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2 text-sm" />
                </label>
                <label className="text-xs font-semibold">Relationship to child
                  <input value={relationships[key] ?? ""} maxLength={80} placeholder="Grandparent, aunt, family friend"
                    onChange={event => setRelationships(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2 text-sm" />
                </label>
                <label className="text-xs font-semibold">Required identity check
                  <select value={methods[key] ?? "government_photo_id"}
                    onChange={event => setMethods(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2 text-sm">
                    <option value="government_photo_id">Government photo ID</option>
                    <option value="school_issued_id">School-issued pickup ID</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">Valid from
                  <input type="date" value={startDates[key] ?? todayForPickupInput()}
                    onChange={event => setStartDates(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2 text-sm" />
                </label>
                <label className="text-xs font-semibold">Valid through (optional)
                  <input type="date" value={expiryDates[key] ?? ""}
                    onChange={event => setExpiryDates(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full rounded border bg-background p-2 text-sm" />
                </label>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Only enter the adult's legal name. Never enter identity-document numbers in CAN OS.</p>
              <button type="button" disabled={!!busy}
                className="mt-3 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                onClick={() => void run(key, `Pickup authorization added for ${student.studentName}.`, (mutationId) => createPickupAuthorization({ data: {
                  studentProfileId: student.studentProfileId,
                  programId: student.programId,
                  householdId: student.householdId,
                  legalFirstName: firstNames[key] ?? "",
                  legalLastName: lastNames[key] ?? "",
                  relationshipLabel: relationships[key] ?? "",
                  identityVerificationMethod: (methods[key] ?? "government_photo_id") as "government_photo_id" | "school_issued_id",
                  startsOn: startDates[key] ?? todayForPickupInput(),
                  expiresOn: expiryDates[key] || null,
                  mutationId,
                } }))}>Save pickup authorization</button>
            </details>

            <details className="mt-3 rounded border border-danger/40 p-3">
              <summary className="cursor-pointer text-sm font-semibold">Report disputed custody — pause all release</summary>
              <p className="mt-2 text-xs text-muted-foreground">This immediately blocks every pickup authorization until an authorized site leader resolves the hold. It does not decide legal custody. The school receives an urgent review task; staff independently determine safe recipients for any family notification.</p>
              <label className="mt-3 block text-xs font-semibold">What requires school review
                <textarea rows={3} maxLength={2000} value={holdReasons[key] ?? ""}
                  onChange={event => setHoldReasons(current => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 w-full rounded border bg-background p-2 text-sm" />
              </label>
              <button type="button" disabled={!!busy || activeHold}
                className="mt-3 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => window.confirm("Pause every pickup release for this child until an authorized site leader resolves the custody hold?") && void run(key + ":hold", `Disputed custody reported for ${student.studentName}; all release is paused.`, (mutationId) => createPickupCustodyHold({ data: {
                  studentProfileId: student.studentProfileId,
                  programId: student.programId,
                  householdId: student.householdId,
                  kind: "disputed_custody" as const,
                  reason: holdReasons[key] ?? "",
                  mutationId,
                } }))}>Pause all pickup release</button>
            </details>

            {student.holds.length > 0 && <div className="mt-4 text-sm">
              <h4 className="font-semibold">Custody restriction history</h4>
              <ul className="mt-2 space-y-2">
                {student.holds.map(hold => <li key={hold.id} className="rounded border p-3">
                  <StatusBadge tone={hold.status === "active" ? "danger" : "neutral"}>{hold.kind.replaceAll("_", " ")} · {hold.status}</StatusBadge>
                  <p className="mt-2">{hold.reason}</p>
                  {hold.resolutionNote && <p className="mt-1 text-xs">School resolution: {hold.resolutionNote}</p>}
                </li>)}
              </ul>
            </div>}

            <div className="mt-4 text-sm">
              <h4 className="font-semibold">Release and denial history</h4>
              <p className="mt-1 text-xs text-muted-foreground">Internal witness evidence, disputed custody reports and denied-person identity details remain restricted to authorized school staff.</p>
              {!student.releases.length && <p className="mt-2 text-xs text-muted-foreground">No pickup attempts have been recorded.</p>}
              <ul className="mt-2 space-y-2">
                {student.releases.map(event => <li key={event.id} className="rounded border p-3">
                  <StatusBadge tone={event.status === "released" ? "success" : "attention"}>{event.status}</StatusBadge>
                  <p className="mt-2">{event.presentedName} · {new Date(event.occurredAt).toLocaleString()}</p>

                </li>)}
              </ul>
            </div>
          </section>;
        })}
      </div>
    </>}
  </WorkspacePanel>;
}
