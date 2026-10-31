import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import {
  approveCanonicalFieldTrip, inviteCanonicalFieldTripStudent,
  listFieldTripOperations, proposeCanonicalFieldTrip,
} from "@/modules/field-trips/field-trip-operations.functions";
import { recordCanonicalFieldTripCheckpoint } from "@/modules/field-trips/field-trip-attendance.functions";

export const Route = createFileRoute("/operations/field-trips")({
  loader: safeLoader(() => listFieldTripOperations(), {
    authMessage: "Sign in as a school registrar to manage field trips.",
  }),
  component: FieldTripOperations,
});

type Data = Awaited<ReturnType<typeof listFieldTripOperations>>;
type Trip = Data["trips"][number];

function asIso(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Enter a valid date and time.");
  return date.toISOString();
}

function FieldTripOperations() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) {
    return <LoaderFailure eyebrow="CAN OS · Operations" title="Field trips" outcome={outcome} />;
  }
  return <FieldTripOperationsView data={outcome.data} />;
}

function FieldTripOperationsView({ data }: { data: Data }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [siteId, setSiteId] = useState(data.sites[0]?.id ?? "");
  const [programId, setProgramId] = useState("");
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [departsAt, setDepartsAt] = useState("");
  const [returnsAt, setReturnsAt] = useState("");
  const [permissionDueAt, setPermissionDueAt] = useState("");
  const [fee, setFee] = useState("0");
  const [permissionVersion, setPermissionVersion] = useState("2026.1");
  const [permissionText, setPermissionText] = useState("");
  const [candidate, setCandidate] = useState<Record<string, string>>({});

  async function run(work: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await work();
      await router.invalidate();
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save field trip change.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceShell eyebrow="CAN OS · Academic operations" title="Field trips"
      subtitle="Plan school trips, publish the school's permission language, invite actively enrolled students, and track signed permissions."
      actions={<div className="flex flex-wrap gap-2">
        <Link to="/operations/course-requests" search={{siteId:undefined,programId:undefined}} className="rounded-lg border px-3 py-2 text-sm">Course approvals</Link>
        <Link to="/operations" search={{siteId:undefined,programId:undefined}} className="rounded-lg border px-3 py-2 text-sm">Operations</Link>
      </div>}>
      {notice && <p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
      <section className="mt-7 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Propose a field trip</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter school-approved permission language. Families see the exact published version;
          changes after approval require a separately reviewed process.
        </p>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={event => {
          event.preventDefault();
          void run(async () => {
            const feeDollars = Number(fee);
            if (!Number.isFinite(feeDollars) || feeDollars < 0 ||
              Math.round(feeDollars * 100) > 1000000) throw new Error("Enter a valid fee.");
            await proposeCanonicalFieldTrip({ data: {
              siteId, programId: programId || null, title, destination,
              departsAt: asIso(departsAt), returnsAt: asIso(returnsAt),
              permissionDueAt: asIso(permissionDueAt),
              feeAmountCents: Math.round(feeDollars * 100),
              permissionVersion, permissionText,
            } });
            setTitle(""); setDestination(""); setDepartsAt("");
            setReturnsAt(""); setPermissionDueAt(""); setPermissionText("");
            setFee("0");
          }, "Field trip proposed. Review and approve it below.");
        }}>
          <label className="text-sm">School
            <select required value={siteId}
              onChange={event => { setSiteId(event.target.value); setProgramId(""); }}
              className="mt-1 block w-full rounded border bg-background p-2">
              {data.sites.map(site =>
                <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Program
            <select value={programId} onChange={event => setProgramId(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-2">
              <option value="">All enrolled programs at this school</option>
              {data.programs.filter(p => p.siteId === siteId).map(program =>
                <option key={program.id} value={program.id}>{program.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Trip title
            <input required minLength={3} maxLength={150} value={title}
              onChange={event => setTitle(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm">Destination
            <input required minLength={3} maxLength={240} value={destination}
              onChange={event => setDestination(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm">Departure
            <input required type="datetime-local" value={departsAt}
              onChange={event => setDepartsAt(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm">Return
            <input required type="datetime-local" value={returnsAt}
              onChange={event => setReturnsAt(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm">Permission deadline
            <input required type="datetime-local" value={permissionDueAt}
              onChange={event => setPermissionDueAt(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm">Trip fee (USD)
            <input required type="number" min={0} max={10000} step="0.01" value={fee}
              onChange={event => setFee(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm">Permission statement version
            <input required maxLength={80} value={permissionVersion}
              onChange={event => setPermissionVersion(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-2" />
          </label>
          <label className="text-sm sm:col-span-2">School-approved guardian permission statement
            <textarea required minLength={40} maxLength={5000} rows={6}
              value={permissionText}
              onChange={event => setPermissionText(event.target.value)}
              className="mt-1 block w-full rounded border bg-background p-3 text-sm"
              placeholder="Paste the school-approved permission and acknowledgement statement here." />
          </label>
          <button disabled={busy || !siteId || !data.programs.some(p => p.siteId === siteId)}
            className="w-fit rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
            Propose trip
          </button>
        </form>
      </section>
      <section className="mt-8 space-y-4" aria-label="Existing field trips">
        <h2 className="text-lg font-semibold">Trips and permissions</h2>
        {data.trips.map(trip => <TripCard key={trip.id} trip={trip} busy={busy}
          candidate={candidate[trip.id] ?? ""}
          onCandidateChange={value => setCandidate(previous => ({ ...previous, [trip.id]: value }))}
          run={run} />)}
        {!data.trips.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">
          No trips are configured for your authorized school or program.
        </p>}
      </section>
    </WorkspaceShell>
  );
}

function TripCard({ trip, busy, candidate, onCandidateChange, run }: {
  trip: Trip; busy: boolean;
  candidate: string; onCandidateChange: (value: string) => void;
  run: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const remaining = trip.students.filter(student => !student.invited);
  return <article className="rounded-xl border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold">{trip.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {trip.siteName} · {trip.destination}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Departs {new Date(trip.departsAt).toLocaleString()} ·
          Permission closes {trip.deadline ? new Date(trip.deadline).toLocaleString() : "before departure"}
        </p>
      </div>
      <span className="rounded-full border px-3 py-1 text-xs">{trip.status}</span>
    </div>
    {!trip.hasPublishedPermission && <p className="mt-3 text-sm text-amber-700">
      This older trip has no valid versioned permission statement. Invitations are unavailable.
    </p>}
    {trip.status === "proposed" &&
      <button type="button" disabled={busy || !trip.hasPublishedPermission}
        className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
        onClick={() => void run(
          () => approveCanonicalFieldTrip({ data: { tripId: trip.id } }),
          "Trip approved and added to the school calendar.",
        )}>Approve trip</button>}
    {trip.status === "approved" && trip.hasPublishedPermission &&
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 text-sm">Invite an enrolled student
          <select value={candidate} onChange={event => onCandidateChange(event.target.value)}
            className="mt-1 block w-full rounded border bg-background p-2">
            <option value="">Select a student</option>
            {remaining.map(student =>
              <option key={student.id} value={student.id}>{student.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !candidate}
          className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          onClick={() => void run(async () => {
            await inviteCanonicalFieldTripStudent({ data: {
              tripId: trip.id, studentProfileId: candidate,
            } });
            onCandidateChange("");
          }, "Invitation sent to the student's guardians.")}>Invite student</button>
      </div>}
    <div className="mt-5 border-t pt-4">
      <h4 className="text-sm font-semibold">Participant permissions and attendance · {trip.roster.length}</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Departure check-in opens six hours before departure. Recording boarding requires guardian permission;
        return check-in requires an existing boarding record. Recorded safety events cannot be silently overwritten.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {trip.roster.map(participant =>
          <div key={participant.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{participant.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {participant.status === "permission_complete" ? "Permission received" : participant.status === "declined" ? "Guardian declined — NOT authorized to board" : "Awaiting permission"}
              {trip.feeAmountCents > 0 &&
                (participant.feeObligationCreated ? " · Fee due in finance" : " · Fee needs finance review")}
            </p>
            <p className="mt-2 text-xs">
              Departure: {participant.departure === "boarded" ? "Boarded" :
                participant.departure === "absent" ? "Absent" : "Not recorded"}
              {" · "}Return: {participant.returned ? "Returned" : "Not recorded"}
            </p>
            {trip.status === "approved" &&
              Date.now() >= new Date(trip.departsAt).getTime() - 6 * 60 * 60 * 1000 &&
              Date.now() <= new Date(trip.returnsAt).getTime() + 7 * 24 * 60 * 60 * 1000 &&
              <div className="mt-3 flex flex-wrap gap-2">
                {!participant.departure &&
                  <>
                    <button type="button"
                      disabled={busy || participant.status !== "permission_complete" ||
                        Date.now() > new Date(trip.returnsAt).getTime()}
                      className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                      onClick={() => void run(() => recordCanonicalFieldTripCheckpoint({ data: {
                        participantId: participant.id, checkpoint: "departure", status: "boarded",
                      } }), "Boarding recorded.")}>Boarded</button>
                    <button type="button" disabled={busy ||
                        Date.now() > new Date(trip.returnsAt).getTime()}
                      className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                      onClick={() => void run(() => recordCanonicalFieldTripCheckpoint({ data: {
                        participantId: participant.id, checkpoint: "departure", status: "absent",
                      } }), "Departure absence recorded.")}>Absent at departure</button>
                  </>}
                {participant.departure === "boarded" && !participant.returned &&
                  <button type="button" disabled={busy}
                    className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                    onClick={() => void run(() => recordCanonicalFieldTripCheckpoint({ data: {
                      participantId: participant.id, checkpoint: "return", status: "returned",
                    } }), "Return recorded.")}>Returned</button>}
              </div>}
          </div>)}
      </div>
      {!trip.roster.length && <p className="mt-3 text-xs text-muted-foreground">
        No students have been invited.
      </p>}
    </div>
  </article>;
}
