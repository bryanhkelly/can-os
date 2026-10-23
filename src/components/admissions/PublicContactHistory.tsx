import { useState } from "react";
import {
  publicInterestContactOutcomes, type PublicInterestContactOutcome,
} from "@/domain/public-interest-contact-history";
import { recordPublicInterestContact } from "@/modules/enrollment/public-interest-contact.functions";
import { listPublicAdmissionsInterests } from "@/modules/enrollment/public-admissions-interest.functions";

type Row = Awaited<ReturnType<typeof listPublicAdmissionsInterests>>[number];
const label: Record<PublicInterestContactOutcome, string> = {
  attempted: "Contact attempted",
  reached: "Family reached",
  tour_requested: "Tour requested",
  not_interested: "Not interested / declined",
  no_response: "No response",
};

function futureLocalDateTime(value: string | null): string {
  const existing = value ? new Date(value) : null;
  const date = existing && existing.getTime() > Date.now()
    ? existing : new Date(Date.now() + 48 * 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
}

export function PublicContactHistory({ row, onSaved }: {
  row: Row; onSaved: () => Promise<void>;
}) {
  const [outcome, setOutcome] = useState<PublicInterestContactOutcome>("attempted");
  const [note, setNote] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState(() =>
    futureLocalDateTime(row.followUpDueAt));
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = row.status !== "closed" && row.status !== "converted" &&
    row.followUpStatus !== "resolved" && row.followUpStatus !== "cancelled";
  const history = [...row.contactHistory].reverse();

  async function record() {
    setBusy(true); setError(""); setNotice("");
    try {
      const nextFollowUpAt = outcome === "not_interested" ? null
        : new Date(nextFollowUp).toISOString();
      await recordPublicInterestContact({ data: {
        requestId, interestId: row.id, outcome,
        note: note.trim(), nextFollowUpAt,
      }});
      setRequestId(crypto.randomUUID());
      setNote("");
      setNotice(outcome === "not_interested"
        ? "Contact outcome saved and interest closed."
        : "Contact recorded; the next follow-up deadline was saved.");
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record contact.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4 rounded-lg border p-3">
    <h4 className="text-sm font-semibold">Contact history</h4>
    <p className="mt-1 text-xs text-muted-foreground">
      Staff-recorded contact only. CAN OS will not automatically call, text or email the family.
    </p>
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
    {active && <div className="mt-3 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs">Contact outcome
          <select value={outcome}
            onChange={event => setOutcome(event.target.value as PublicInterestContactOutcome)}
            className="w-full rounded-lg border bg-background p-2 text-sm">
            {publicInterestContactOutcomes.map(item =>
              <option key={item} value={item}>{label[item]}</option>)}
          </select>
        </label>
        {outcome !== "not_interested" && <label className="grid gap-1 text-xs">
          Next follow-up (required)
          <input type="datetime-local" value={nextFollowUp}
            onChange={event => setNextFollowUp(event.target.value)}
            className="w-full rounded-lg border bg-background p-2 text-sm" />
        </label>}
      </div>
      <label className="grid gap-1 text-xs">Internal note (optional, staff-only)
        <textarea value={note} rows={2} maxLength={500}
          onChange={event => setNote(event.target.value)}
          placeholder="Briefly record what happened; do not include unnecessary student details."
          className="w-full rounded-lg border bg-background p-2 text-sm" />
      </label>
      <div>
        <button type="button" disabled={busy || (outcome !== "not_interested" && !nextFollowUp)}
          onClick={() => void record()}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Record contact"}
        </button>
      </div>
    </div>}
    <ol className="mt-3 space-y-2">
      {history.map(entry => <li key={entry.requestId} className="rounded-lg bg-muted/40 p-3 text-sm">
        <p className="font-medium">{label[entry.outcome]}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(entry.recordedAt).toLocaleString()} · Recorded by
          {" "}{row.contactActors[entry.actorPersonId] ?? "authorized staff"}
          {entry.nextFollowUpAt && <> · Next due {new Date(entry.nextFollowUpAt).toLocaleString()}</>}
        </p>
        {entry.note && <p className="mt-1 whitespace-pre-wrap">{entry.note}</p>}
      </li>)}
      {history.length === 0 && <li className="text-xs text-muted-foreground">
        No recorded contact attempts yet.
      </li>}
    </ol>
  </div>;
}
