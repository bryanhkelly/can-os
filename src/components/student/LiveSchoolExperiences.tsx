import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { formatTimeLabel, useWallClock } from "@/components/student/experience-time";
import {
  cancelOfficeHour,
  getSchoolExperiences,
  rescheduleOfficeHour,
} from "@/modules/student-experience/school-experiences.functions";

type Experiences = Awaited<ReturnType<typeof getSchoolExperiences>>;
type Appointment = Experiences["officeHours"]["appointments"][number];
type Slot = Experiences["officeHours"]["openSlots"][number];

const errorCopy = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** Student/guardian surface for booked office hours plus open slots and trips. */
export function GuardianExperienceBoard() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { student?: string };
  const studentProfileId = typeof search.student === "string" ? search.student : "";
  const wallClock = useWallClock(30_000);
  const [data, setData] = useState<Experiences | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [rescheduling, setRescheduling] = useState("");
  const [replacement, setReplacement] = useState("");

  const refresh = useCallback(async () => {
    if (!studentProfileId) {
      setData(null);
      setError("Choose a linked student to review school experiences.");
      return;
    }
    try {
      const next = await getSchoolExperiences({ data: { studentProfileId } });
      setData(next);
      setError("");
    } catch (cause) {
      setData(null);
      setError(errorCopy(cause, "Unable to load school experiences"));
    }
  }, [studentProfileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const change = (message: string) => {
    setNotice(message);
    setError("");
    void refresh();
  };

  const cancel = async (bookingId: string) => {
    if (!window.confirm("Cancel this appointment?")) return;
    setBusy(bookingId);
    try {
      await cancelOfficeHour({ data: { bookingId } });
      change("Appointment cancelled.");
    } catch (cause) {
      setError(errorCopy(cause, "Unable to cancel appointment"));
    } finally {
      setBusy("");
    }
  };

  const reschedule = async (bookingId: string) => {
    if (!replacement) {
      setError("Choose a replacement time first.");
      return;
    }
    setBusy(bookingId);
    try {
      await rescheduleOfficeHour({ data: { bookingId, newSlotId: replacement } });
      setRescheduling("");
      setReplacement("");
      change("Appointment rescheduled.");
    } catch (cause) {
      setError(errorCopy(cause, "Unable to reschedule appointment"));
    } finally {
      setBusy("");
    }
  };

  if (!studentProfileId) {
    return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <p role="alert" className="rounded-lg border p-4 text-sm">
        Choose a linked student to review school experiences.
      </p>
    </main>;
  }

  if (!data && !error) {
    return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <p role="status" className="text-sm">Loading school experiences…</p>
    </main>;
  }

  const appointments = data?.officeHours.appointments ?? [];
  const openSlots = data?.officeHours.openSlots ?? [];
  const fieldTrips = data?.fieldTrips ?? [];
  const openSlotsFor = (appointment: Appointment) => openSlots.filter(
    slot => slot.teacherPersonId === appointment.teacherPersonId && slot.slotId !== appointment.slotId,
  );

  return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
    <div className="mx-auto max-w-4xl">
      <Link to="/guardian" className="text-xs font-semibold text-muted-foreground">
        Back to family home
      </Link>
      <h1 className="mt-3 font-serif text-3xl">School experiences</h1>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-300 p-3 text-sm">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-300 p-3 text-sm">{notice}</p>}

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Office-hour appointments</h2>
        {appointments.length === 0 && <p className="mt-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No upcoming office-hour appointments.
        </p>}
        <div className="mt-4 grid gap-4">
          {appointments.map(appointment => <article key={appointment.bookingId} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{appointment.teacherName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {wallClock.formatDay(appointment.startsAt)} · {formatTimeLabel(appointment.startsAt)} – {formatTimeLabel(appointment.endsAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy !== ""}
                  className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  onClick={() => {
                    setRescheduling(current => current === appointment.bookingId ? "" : appointment.bookingId);
                    setReplacement("");
                  }}>
                  Reschedule
                </button>
                <button type="button" disabled={busy !== ""}
                  className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  onClick={() => void cancel(appointment.bookingId)}>
                  Cancel
                </button>
              </div>
            </div>
            {rescheduling === appointment.bookingId && <div className="mt-4 rounded-lg border p-3">
              {openSlotsFor(appointment).length === 0 ? <p className="text-xs text-muted-foreground">
                No other open times with this teacher.
              </p> : <>
                <label className="block text-xs font-semibold">Replacement time
                  <select className="mt-1 w-full rounded border bg-background p-2" value={replacement}
                    onChange={event => setReplacement(event.target.value)}>
                    <option value="">Choose a time</option>
                    {openSlotsFor(appointment).map(slot => <option key={slot.slotId} value={slot.slotId}>
                      {wallClock.formatDay(slot.startsAt)} · {formatTimeLabel(slot.startsAt)}
                    </option>)}
                  </select>
                </label>
                <button type="button" disabled={busy !== "" || !replacement}
                  className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  onClick={() => void reschedule(appointment.bookingId)}>
                  Confirm new time
                </button>
              </>}
            </div>}
          </article>)}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Open office-hour times</h2>
        {openSlots.length === 0 && <p className="mt-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No office-hour slots are currently open for booking.
        </p>}
        <ul className="mt-4 grid gap-2">
          {openSlots.map(slot => <li key={slot.slotId} className="rounded-lg border bg-card p-3 text-sm">
            {slot.teacherName} · {wallClock.formatDay(slot.startsAt)} · {formatTimeLabel(slot.startsAt)}
          </li>)}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Field trips</h2>
        {fieldTrips.length === 0 && <p className="mt-3 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No upcoming field trips.
        </p>}
        <div className="mt-4 grid gap-3">
          {fieldTrips.map(trip => <article key={trip.fieldTripId} className="rounded-xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{trip.title}</strong>
              <span className="text-xs text-muted-foreground">
                {wallClock.formatDay(trip.departureAt)} · {formatTimeLabel(trip.departureAt)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Permission status: {trip.permissionStatus}</p>
            {trip.needsPermission && <Link to="/guardian/field-trips"
              className="mt-2 inline-block rounded-lg border px-3 py-2 text-xs font-semibold">
              Review permission
            </Link>}
          </article>)}
        </div>
      </section>
    </div>
  </main>;
}
