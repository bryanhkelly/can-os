import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { useCallback, useEffect, useRef, useState } from "react";
import { MutationFeedback, StatusBadge, WorkspacePanel } from "@/components/workspace";
import {
  createPickupAuthorization,
  createPickupCustodyHold,
  getGuardianPickupWorkspace,
  revokePickupAuthorization,
} from "@/modules/operations/pickup.functions";

type Workspace = Awaited<ReturnType<typeof getGuardianPickupWorkspace>>;
type Student = Workspace["students"][number];
const keyFor = (student: Student) => student.programId + ":" + student.studentProfileId + ":" + student.householdId;
/** Family release-authority management and authorized handoff history. */
export function GuardianPickupPanel({ studentPersonId }: { studentPersonId?: string }) {
  const [workspaceSnapshot, setWorkspace] = useState<{
    studentPersonId: string | undefined; value: Workspace;
  } | null>(null);
  // Filter during render, before effects run, so another child's authority
  // never flashes on screen after selecting a different child.
  const workspace = workspaceSnapshot?.studentPersonId === studentPersonId
    ? workspaceSnapshot.value : null;
  const pendingMutationIds = useRef(new Map<string, string>());
  const requestSequence = useRef(0);
  // A child selection can change before an earlier response settles.
  const activeStudentPersonId = useRef(studentPersonId);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async (propagateFailure = false) => {
    if (studentPersonId !== activeStudentPersonId.current) {
      if (propagateFailure) throw new Error("Pickup authority context changed; retry refresh.");
      return;
    }
    const request = ++requestSequence.current;
    setLoading(true);
    setError("");
    setWorkspace(null); // Never offer previous-child authorizations as current.
    try {
      const next = await getGuardianPickupWorkspace({ data: { studentPersonId } });
      if (request !== requestSequence.current ||
          studentPersonId !== activeStudentPersonId.current) {
        if (propagateFailure) throw new Error("Pickup authority context changed; retry refresh.");
        return;
      }
      setWorkspace({ studentPersonId, value: next });
    } catch (cause) {
      if (request === requestSequence.current &&
          studentPersonId === activeStudentPersonId.current) {
        setWorkspace(null);
        setError(mutationErrorMessage(cause, "Unable to load pickup authority"));
      }
      // An automatic load reports errors in the panel. A post-command refresh
      // must reject so mutation feedback blocks further custody changes.
      if (propagateFailure) throw cause;
    } finally {
      if (request === requestSequence.current &&
          studentPersonId === activeStudentPersonId.current) setLoading(false);
    }
  }, [studentPersonId]);
  const mutation = useMutationFeedback(() => load(true));
  const busy = mutation.pending || mutation.refreshFailed;

  useEffect(() => {
    activeStudentPersonId.current = studentPersonId;
    setNotice("");
    // Child-specific identity and custody drafts must never follow a guardian
    // into another child's release-authority workspace.
    setFirstNames({});
    setLastNames({});
    setRelationships({});
    setMethods({});
    setStartDates({});
    setExpiryDates({});
    setRevocationReasons({});
    setHoldReasons({});
    pendingMutationIds.current.clear();
    void load();
    return () => { requestSequence.current++; };
  }, [load]);

  async function run(key: string, message: string, command: (mutationId: string) => Promise<unknown>) {
    if (busy) return;
    const mutationId = pendingMutationIds.current.get(key) ?? crypto.randomUUID();
    pendingMutationIds.current.set(key, mutationId);
    setError("");
    setNotice("");
    const outcome=await mutation.run(()=>command(mutationId),{
      successMessage:message,
      commandErrorMessage:"Pickup change could not be confirmed.",
      refreshErrorMessage:"The pickup change was saved, but updated pickup authority could not be loaded. Retry the refresh before submitting another change.",
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      pendingMutationIds.current.delete(key);
    } else if(outcome.status==="failed"){
      // The server may have committed a guardian authorization, revocation or
      // custody hold before the response was lost. Do not create a new event
      // identity until an unchanged retry has been acknowledged.
      setError((mutationErrorMessage(outcome.error, "Pickup change could not be confirmed")) +
        " The result may already be saved. Refresh pickup history and retry with the same details; the original request ID will be reused.");
    }
  }
  async function retryRefresh(){
    const outcome=await mutation.retryRefresh();
    if(outcome.status==="refreshed"){
      setError("");
    }
    return outcome;
  }

  return <WorkspacePanel id="pickup" title="Pickup authorization & release history"
    description="Authorize a person by legal name and required identity check. School staff must still verify the adult and witness every handoff."
    className="mt-8">
    {notice && <p role="status" className="mb-4  border p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mb-4  border p-3 text-sm">{error}</p>}
    <MutationFeedback state={{...mutation,retryRefresh}} className="mb-4" pendingMessage="Updating pickup authority…"/>
    {loading && <p role="status" className="text-sm">Loading pickup authority…</p>}
    {!loading && workspace && <>
      <p className="mb-5 text-xs text-muted-foreground">{workspace.note}</p>
      {!workspace.students.length && <p className="text-sm">No verified guardian pickup relationships are available for the current school scope.</p>}
      <div className="grid gap-5">
        {workspace.students.map(student => {
          const key = keyFor(student);
          const activeHold = student.holds.some(hold => hold.status === "active");
          const startsOn = startDates[key] ?? student.schoolLocalToday;
          const expiresOn = expiryDates[key] ?? "";
          const authorizationReady = Boolean(firstNames[key]?.trim() && lastNames[key]?.trim() &&
            (relationships[key] ?? "").trim().length >= 2 && startsOn &&
            (!expiresOn || expiresOn >= startsOn));
          return <section key={key} className=" border p-4" aria-label={`Pickup authority for ${student.studentName}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold">{student.studentName}</h3>
                <p className="text-xs text-muted-foreground">{student.programName}</p></div>
              {activeHold && <StatusBadge tone="danger">All release held</StatusBadge>}
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-semibold">Authorized adults</h4>
              {!student.authorizations.length && <p className="mt-2 text-sm text-muted-foreground">No pickup people have been authorized.</p>}
              <div className="mt-2 grid gap-3">
                {student.authorizations.map(adult => <div key={adult.id} className=" border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{adult.pickupName}</p>
                    <StatusBadge tone={adult.status === "active" ? "success" : "neutral"}>{adult.status}</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{adult.relationshipLabel} · {adult.identityVerificationMethod.replaceAll("_", " ")} · {adult.startsOn}{adult.expiresOn ? ` through ${adult.expiresOn}` : " with no expiry"}</p>
                  {adult.status === "active" && <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold">Revoke authorization</summary>
                    <Label className="mt-2 block text-xs">Reason
                      <Textarea rows={2} maxLength={2000} minLength={10} required value={revocationReasons[adult.id] ?? ""}
                        onChange={event => setRevocationReasons(current => ({ ...current, [adult.id]: event.target.value }))}
                        className="mt-1 w-full  border bg-background p-2" />
                    </Label>
                    <Button variant="outline" type="button" disabled={busy || (revocationReasons[adult.id] ?? "").trim().length < 10}
                      className="mt-2  border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      onClick={() => void run(adult.id, `Pickup authorization revoked for ${adult.pickupName}.`, (mutationId) => revokePickupAuthorization({ data: {
                        authorizationId: adult.id,
                        reason: revocationReasons[adult.id] ?? "",
                        mutationId,
                      } }))}>Revoke future pickup</Button>
                  </details>}
                </div>)}
              </div>
            </div>

            <details className="mt-4  border p-3">
              <summary className="cursor-pointer text-sm font-semibold">Authorize a pickup person</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Label className="text-xs font-semibold">Legal first name
                  <Input value={firstNames[key] ?? ""} maxLength={100}
                    onChange={event => setFirstNames(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full  border bg-background p-2 text-sm" />
                </Label>
                <Label className="text-xs font-semibold">Legal last name
                  <Input value={lastNames[key] ?? ""} maxLength={100}
                    onChange={event => setLastNames(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full  border bg-background p-2 text-sm" />
                </Label>
                <Label className="text-xs font-semibold">Relationship to child
                  <Input value={relationships[key] ?? ""} maxLength={80} placeholder="Grandparent, aunt, family friend"
                    onChange={event => setRelationships(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full  border bg-background p-2 text-sm" />
                </Label>
                <Label className="text-xs font-semibold">Required identity check
                  <Select value={methods[key] ?? "government_photo_id"}
                    onChange={event => setMethods(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full  border bg-background p-2 text-sm">
                    <option value="government_photo_id">Government photo ID</option>
                    <option value="school_issued_id">School-issued pickup ID</option>
                  </Select>
                </Label>
                <Label className="text-xs font-semibold">Valid from
                  <Input type="date" value={startDates[key] ?? student.schoolLocalToday}
                    onChange={event => setStartDates(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full  border bg-background p-2 text-sm" />
                </Label>
                <Label className="text-xs font-semibold">Valid through (optional)
                  <Input type="date" value={expiryDates[key] ?? ""}
                    onChange={event => setExpiryDates(current => ({ ...current, [key]: event.target.value }))}
                    className="mt-1 w-full  border bg-background p-2 text-sm" />
                </Label>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Only enter the adult's legal name. Never enter identity-document numbers in CAN OS. The default start date uses the school's local calendar day, not your device's time zone.</p>
              <p className="mt-2 text-xs text-muted-foreground">Enter both legal names, a relationship of at least two characters, and a valid date range to save.</p>
              <Button variant="default" type="button" disabled={busy || !authorizationReady}
                className="mt-3  bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                onClick={() => void run(key, `Pickup authorization added for ${student.studentName}.`, (mutationId) => createPickupAuthorization({ data: {
                  studentProfileId: student.studentProfileId,
                  programId: student.programId,
                  householdId: student.householdId,
                  legalFirstName: firstNames[key] ?? "",
                  legalLastName: lastNames[key] ?? "",
                  relationshipLabel: relationships[key] ?? "",
                  identityVerificationMethod: (methods[key] ?? "government_photo_id") as "government_photo_id" | "school_issued_id",
                  startsOn: startDates[key] ?? student.schoolLocalToday,
                  expiresOn: expiryDates[key] || null,
                  mutationId,
                } }))}>Save pickup authorization</Button>
            </details>

            <details className="mt-3  border border-danger/40 p-3">
              <summary className="cursor-pointer text-sm font-semibold">Report disputed custody — pause all release</summary>
              <p className="mt-2 text-xs text-muted-foreground">This immediately blocks every pickup authorization until an authorized site leader resolves the hold. It does not decide legal custody. The school receives an urgent review task; staff independently determine safe recipients for any family notification.</p>
              <Label className="mt-3 block text-xs font-semibold">What requires school review
                <Textarea rows={3} maxLength={2000} minLength={10} required value={holdReasons[key] ?? ""}
                  onChange={event => setHoldReasons(current => ({ ...current, [key]: event.target.value }))}
                  className="mt-1 w-full  border bg-background p-2 text-sm" />
              </Label>
              <Button variant="outline" type="button" disabled={busy || activeHold || (holdReasons[key] ?? "").trim().length < 10}
                className="mt-3  border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => window.confirm("Pause every pickup release for this child until an authorized site leader resolves the custody hold?") && void run(key + ":hold", `Disputed custody reported for ${student.studentName}; all release is paused.`, (mutationId) => createPickupCustodyHold({ data: {
                  studentProfileId: student.studentProfileId,
                  programId: student.programId,
                  householdId: student.householdId,
                  kind: "disputed_custody" as const,
                  reason: holdReasons[key] ?? "",
                  mutationId,
                } }))}>Pause all pickup release</Button>
            </details>

            {student.holds.length > 0 && <div className="mt-4 text-sm">
              <h4 className="font-semibold">Custody restriction history</h4>
              <ul className="mt-2 space-y-2">
                {student.holds.map(hold => <li key={hold.id} className=" border p-3">
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
                {student.releases.map(event => <li key={event.id} className=" border p-3">
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
