import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  assignPublicInterestFollowUp, listPublicAdmissionsInterests,
  listPublicInterestFollowUpAssignees, resolvePublicInterestFollowUp,
  setPublicAdmissionsInterestStatus,
} from "@/modules/enrollment/public-admissions-interest.functions";

type Row = Awaited<ReturnType<typeof listPublicAdmissionsInterests>>[number];
type Assignee = Awaited<ReturnType<typeof listPublicInterestFollowUpAssignees>>[number];

function localDateTime(value: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 48 * 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
}

function FollowUpControls({ row, assignees, onSaved }: {
  row: Row; assignees: readonly Assignee[]; onSaved: () => Promise<void>;
}) {
  const [owner, setOwner] = useState(row.followUpOwnerPersonId ?? "");
  const [deadline, setDeadline] = useState(() => localDateTime(row.followUpDueAt));
  const [resolutionNote, setResolutionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const candidates = assignees.filter(person => person.organizationId === row.organizationId &&
    (person.siteId === null || person.siteId === row.siteId))
    .filter((person, index, all) => all.findIndex(p => p.personId === person.personId) === index);
  const due = row.followUpDueAt ? new Date(row.followUpDueAt) : null;
  const overdue = due !== null && due.getTime() < Date.now() &&
    row.followUpStatus !== "resolved" && row.followUpStatus !== "cancelled";
  const completed = row.followUpStatus === "resolved" || row.followUpStatus === "cancelled";
  const editable = !completed && row.status !== "converted" && row.status !== "closed";

  async function perform(operation: () => Promise<unknown>, success: string) {
    setSaving(true); setError(""); setNotice("");
    try {
      await operation();
      await onSaved();
      setNotice(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update follow-up.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-4 rounded-lg border p-3">
    <p className="text-sm font-semibold">Family inquiry follow-up</p>
    <p className="mt-1 text-xs text-muted-foreground">
      {row.followUpStatus ?? "Not yet assigned"} · {due
        ? `Due ${due.toLocaleString()}` : "No deadline recorded"}
      {overdue ? " · Overdue" : ""}
      {row.followUpOwnerPersonId && !candidates.some(person => person.personId === row.followUpOwnerPersonId)
        ? " · Assigned registrar no longer eligible" : ""}
    </p>
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
    {editable && <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1 text-xs">Assigned admissions registrar
        <select value={owner} onChange={event => setOwner(event.target.value)}
          className="w-full rounded-lg border bg-background p-2 text-sm">
          <option value="">Unassigned</option>
          {candidates.map(person => <option key={person.personId} value={person.personId}>
            {person.firstName} {person.lastName}
          </option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs">Follow-up deadline
        <input type="datetime-local" value={deadline}
          onChange={event => setDeadline(event.target.value)}
          className="w-full rounded-lg border bg-background p-2 text-sm" />
      </label>
      <button type="button" disabled={saving || !deadline}
        onClick={() => void perform(() => assignPublicInterestFollowUp({
          data: { interestId: row.id, ownerPersonId: owner || null,
            dueAt: new Date(deadline).toISOString() },
        }), "Follow-up assignment and deadline saved.")}
        className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
        Save follow-up
      </button>
    </div>}
    {editable && <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="grid min-w-52 flex-1 gap-1 text-xs">Resolution note
        <input value={resolutionNote} onChange={event => setResolutionNote(event.target.value)}
          placeholder="How was this follow-up completed?"
          maxLength={500} className="rounded-lg border bg-background p-2 text-sm" />
      </label>
      <button type="button" disabled={saving || resolutionNote.trim().length < 5}
        onClick={() => void perform(() => resolvePublicInterestFollowUp({
          data: { interestId: row.id, resolutionNote: resolutionNote.trim() },
        }), "Follow-up resolved. Interest remains in admissions until closed or converted.")}
        className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
        Resolve follow-up
      </button>
    </div>}
  </div>;
}

/** These records contain unverified parent-supplied contact data. */
export function PublicInterestInbox({ items, assignees }: {
  items: readonly Row[]; assignees: readonly Assignee[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function changeStatus(row: Row, status: "contacted" | "closed") {
    setBusyId(row.id); setError(""); setNotice("");
    try {
      await setPublicAdmissionsInterestStatus({ data: { interestId: row.id, status } });
      setNotice(status === "contacted"
        ? "Contact recorded. This does not verify a guardian or create an Application."
        : "Interest and its open follow-up closed.");
      await router.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update interest.");
    } finally {
      setBusyId(null);
    }
  }
  return <section className="mt-8 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Public program interest</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Requests from published program pages. A registrar may review a contact,
      confirm the new student identity and carry these details into the normal
      admissions inquiry. Any guardian relationship remains pending verification;
      a public request never grants school access.
    </p>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    <div className="mt-4 grid gap-3">
      {items.map(row => <article key={row.id} className="rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{row.firstName} {row.lastName}</h3>
            <p className="text-sm text-muted-foreground">{row.programName}</p>
            <p className="mt-1 text-sm">{row.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()} · {row.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {row.applicationId ? <Link to="/admissions/intake"
              search={{ siteId: row.siteId, programId: row.programId,
                application: row.applicationId, interest: undefined }}
              className="rounded-lg border px-3 py-2 text-xs font-semibold">
              View linked inquiry
            </Link> : row.status !== "closed" && <Link to="/admissions/intake"
              search={{ siteId: row.siteId, programId: row.programId,
                application: undefined, interest: row.id }}
              className="rounded-lg border px-3 py-2 text-xs font-semibold">
              Review and create inquiry
            </Link>}
            {row.status === "new" && <button type="button" disabled={busyId !== null}
              onClick={() => void changeStatus(row, "contacted")}
              className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">
              Mark contacted
            </button>}
            {row.status !== "closed" && row.status !== "converted" &&
              <button type="button" disabled={busyId !== null}
                onClick={() => void changeStatus(row, "closed")}
                className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">
                Close
              </button>}
          </div>
        </div>
        {row.message && <p className="mt-3 whitespace-pre-wrap text-sm">{row.message}</p>}
        <FollowUpControls row={row} assignees={assignees}
          onSaved={async () => { await router.invalidate(); }} />
      </article>)}
      {items.length === 0 && <p className="text-sm text-muted-foreground">
        No public information requests in your authorized programs.
      </p>}
    </div>
  </section>;
}
