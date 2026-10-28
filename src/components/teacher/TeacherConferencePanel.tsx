import { useEffect, useState } from "react";
import {
  cancelTeacherConferenceBooking,
  completeTeacherConference,
  createTeacherConferenceSeries,
  getTeacherConferences,
  queueTeacherConferenceReminder,
} from "@/modules/conferences/conference.functions";

type Data = Awaited<ReturnType<typeof getTeacherConferences>>;

const pad = (value: number) => String(value).padStart(2, "0");
/** Local wall-time value for <input type="datetime-local">. */
function localInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultWindow() {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { startsAt: localInputValue(start), endsAt: localInputValue(end) };
}

/**
 * Teacher office-hour conferences: open a bookable window, then record
 * outcomes, queue guardian reminders or cancel bookings. All writes go
 * through the conference service's capability and scope checks.
 */
export function TeacherConferencePanel() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("Family office hours");
  const [range, setRange] = useState(defaultWindow);
  const [slotMinutes, setSlotMinutes] = useState(20);

  async function refresh() {
    try {
      setData(await getTeacherConferences());
      setLoadError("");
    } catch {
      setLoadError("Conference scheduling is unavailable for this account.");
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function perform(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); setMessage(success); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save change"); }
    finally { setBusy(false); }
  }

  const format = (stamp: string) => new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(stamp));

  return <section className="mt-10" aria-label="Family conferences">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Family conferences</p>
    <p className="mt-2 text-sm text-muted-foreground">
      Open bookable office-hour windows for your students' guardians, then record how each appointment went.
    </p>
    {loadError && <p role="status" className="mt-3 text-sm">{loadError}</p>}
    {message && <p role="status" className="mt-3 rounded-lg border border-emerald-300 p-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-300 p-3 text-sm">{error}</p>}

    {data?.connected && <>
      <form className="mt-4 grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-2" aria-label="Open office-hour window"
        onSubmit={event => {
          event.preventDefault();
          void perform(() => createTeacherConferenceSeries({ data: {
            title,
            startsAt: new Date(range.startsAt).toISOString(),
            endsAt: new Date(range.endsAt).toISOString(),
            slotMinutes,
          } }), "Office-hour window published for guardians.");
        }}>
        <label className="text-xs sm:col-span-2">Title
          <input required minLength={3} value={title} onChange={event => setTitle(event.target.value)}
            className="mt-1 block w-full rounded border bg-background p-2" />
        </label>
        <label className="text-xs">Window starts
          <input required type="datetime-local" value={range.startsAt}
            onChange={event => setRange(value => ({ ...value, startsAt: event.target.value }))}
            className="mt-1 block w-full rounded border bg-background p-2" />
        </label>
        <label className="text-xs">Window ends
          <input required type="datetime-local" value={range.endsAt}
            onChange={event => setRange(value => ({ ...value, endsAt: event.target.value }))}
            className="mt-1 block w-full rounded border bg-background p-2" />
        </label>
        <label className="text-xs">Minutes per appointment
          <input required type="number" min={5} max={120} step={5} value={slotMinutes}
            onChange={event => setSlotMinutes(Number(event.target.value))}
            className="mt-1 block w-full rounded border bg-background p-2" />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={busy}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
            Publish bookable window
          </button>
        </div>
      </form>

      <div className="mt-6 grid gap-3">
        {data.series.length === 0 && <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No upcoming office-hour windows yet.
        </p>}
        {data.series.map(series => <article key={series.id} className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{series.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {format(series.startsAt)} – {format(series.endsAt)} · {series.slotMinutes}-minute appointments ·{" "}
            {series.availableCount} of {series.slotCount} still open
          </p>
        </article>)}
      </div>

      {data.bookings.length > 0 && <div className="mt-6 grid gap-3" aria-label="Upcoming conference bookings">
        {data.bookings.map(booking => <article key={booking.id} className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{booking.studentName}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {booking.seriesTitle} · {format(booking.startsAt)} · {booking.status === "booked" ? "Confirmed" : booking.status}
              </p>
            </div>
            {booking.status === "booked" && <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy}
                className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => void perform(() => completeTeacherConference({ data: { bookingId: booking.id, outcome: "held" } }), "Appointment marked as held.")}>
                Mark held
              </button>
              <button type="button" disabled={busy}
                className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => void perform(() => completeTeacherConference({ data: { bookingId: booking.id, outcome: "no_show" } }), "No-show recorded.")}>
                No-show
              </button>
              <button type="button" disabled={busy}
                className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => void perform(() => queueTeacherConferenceReminder({ data: { bookingId: booking.id } }), "Reminder queued for the guardian.")}>
                Send reminder
              </button>
              <button type="button" disabled={busy}
                className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => {
                  if (!window.confirm("Cancel this appointment? The slot will open for another family.")) return;
                  void perform(() => cancelTeacherConferenceBooking({ data: { bookingId: booking.id } }), "Appointment cancelled and slot reopened.");
                }}>
                Cancel booking
              </button>
            </div>}
          </div>
        </article>)}
      </div>}
    </>}
  </section>;
}
