import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { OnsiteSupervisionPanel } from "@/components/operations/OnsiteSupervisionPanel";
import {
  getOnsiteStaffDayContext, listExpectedOnsiteRoster,
  markExpectedOnsiteAttendance,
} from "@/modules/attendance/onsite-attendance-workflow.functions";

export const Route = createFileRoute("/site/day")({ component: SiteDayPage });

type Roster = Awaited<ReturnType<typeof listExpectedOnsiteRoster>>;
type Student = Roster["students"][number];
const marks = ["present", "tardy", "absent"] as const;

/**
 * Onsite facilitator surface: one site and its scheduled school-day roster.
 * No family excuse details, counseling records, schoolwide action lists,
 * student grades, sign-out/release authorization, or local-storage PII.
 */
export function SiteDayPage() {
  const [context, setContext] = useState<
    Awaited<ReturnType<typeof getOnsiteStaffDayContext>> | null>(null);
  const [date, setDate] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (targetDate: string) => {
    setLoading(true); setError(""); setRoster(null);
    try {
      const result = await listExpectedOnsiteRoster({ data: { date: targetDate } });
      setRoster(result);
    } catch {
      setError("Unable to load scheduled onsite attendance. Verify your active site membership and calendar.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void getOnsiteStaffDayContext().then(site => {
      if (!active) return;
      setContext(site);
      setDate(site.date);
      void load(site.date);
    }).catch(() => {
      if (!active) return;
      setError("Sign in with a room facilitator, site staff or site leader membership for this site.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [load]);

  async function mark(student: Student, status: (typeof marks)[number]) {
    if (!context || busy) return;
    const key = student.programId + ":" + student.studentProfileId;
    const note = notes[key]?.trim() ?? "";
    if (student.attendanceEventId && note.length < 10) {
      setError("Explain the reason for changing an existing school attendance record (at least 10 characters).");
      return;
    }
    setBusy(key); setError(""); setNotice("");
    try {
      await markExpectedOnsiteAttendance({ data: {
        studentProfileId: student.studentProfileId,
        programId: student.programId,
        date, status, mutationId: crypto.randomUUID(),
        expectedPreviousEventId: student.attendanceEventId,
        note,
      } });
      setNotice(student.studentName + " — " + status + " recorded.");
      setNotes(current => ({ ...current, [key]: "" }));
      await load(date);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record attendance. Refresh and verify.");
    } finally { setBusy(""); }
  }

  return <main className="mx-auto max-w-5xl px-5 py-10">
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Hybrid site</p>
    <h1 className="mt-2 font-serif text-4xl">Onsite day</h1>
    <p className="mt-3 text-sm text-muted-foreground">
      {context?.siteName ?? "Your assigned site"} · staff-observed attendance only.
      Online lesson activity cannot mark a learner present or absent.
    </p>
    <p className="mt-2 text-xs text-muted-foreground">
      Arrival marks are not student release or checkout authorization. Contact your designated site lead
      for unexpected absences, emergencies or custody concerns.
    </p>
    {context && <label className="mt-6 block max-w-sm text-sm font-semibold">
      School-local attendance date
      <input type="date" value={date} max={context.date}
        className="mt-2 w-full rounded border bg-background p-3"
        onChange={event => {
          setDate(event.target.value); setNotice(""); setNotes({});
          if (event.target.value) void load(event.target.value);
        }} />
      <span className="mt-1 block text-xs text-muted-foreground">{context.timeZone}</span>
    </label>}
    {notice && <p role="status" className="mt-4 rounded border p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded border p-3 text-sm">{error}</p>}
    {loading && !error && <p role="status" className="mt-5 text-sm">Loading scheduled roster…</p>}
    {roster && <>
      <p className="mt-3 text-xs text-muted-foreground">
        These are expected student-program attendance entries, not a deduplicated headcount or proof
        of physical presence until a staff member records the observation. Corrections are limited
        to the previous 30 days and must include a reason.
      </p>
      {roster.programs.some(program => program.configuration !== "configured") &&
        <p role="status" className="mt-5 rounded border p-4 text-sm">
          One or more onsite calendars or schedules are incomplete. No presence is inferred
          from missing configuration; ask the school registrar to correct the schedule.
        </p>}
      <div className="mt-6 grid grid-cols-3 gap-3 text-sm" aria-label="Onsite day summary">
        <div className="rounded border p-3">Expected program roster entries
          <strong className="mt-1 block text-2xl">{roster.students.length}</strong></div>
        <div className="rounded border p-3">Staff-marked entries
          <strong className="mt-1 block text-2xl">
            {roster.students.filter(student => !["unmarked","expected"].includes(student.status)).length}
          </strong></div>
        <div className="rounded border p-3">Unrecorded entries
          <strong className="mt-1 block text-2xl">
            {roster.students.filter(student => ["unmarked","expected"].includes(student.status)).length}
          </strong></div>
      </div>
      {!roster.students.length && <p className="mt-6 text-sm">
        No verified scheduled onsite students for this date under your current site grant.
        This is not evidence that students were absent.
      </p>}
      <div className="mt-6 grid gap-4">
        {roster.students.map(student => {
          const key = student.programId + ":" + student.studentProfileId;
          return <section key={key} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="font-semibold">{student.studentName}</h2>
                <p className="text-xs text-muted-foreground">
                  {student.programName} · {student.sectionTitle ?? "Program roster"}
                </p></div>
              <span className="rounded-full border px-3 py-1 text-xs capitalize">{student.status}</span>
            </div>
            {student.attendanceEventId && <label className="mt-3 block text-xs">
              Correction reason (required)
              <input value={notes[key] ?? ""} maxLength={2000}
                onChange={event => setNotes(current => ({ ...current, [key]: event.target.value }))}
                placeholder="Why is this recorded attendance changing?"
                className="mt-1 w-full rounded border p-2 text-sm"/>
            </label>}
            <div className="mt-4 flex flex-wrap gap-2">
              {marks.map(status => <button key={status} type="button"
                disabled={!!busy || !date || date > (context?.date ?? "")}
                className="rounded border px-3 py-2 text-xs font-semibold capitalize disabled:opacity-50"
                onClick={() => void mark(student, status)}>
                Record {status}
              </button>)}
            </div>
          </section>;
        })}
      </div>
      <button type="button" onClick={() => void load(date)}
        className="mt-6 text-sm underline">Refresh school roster</button>
    </>}
    {context && date && <OnsiteSupervisionPanel date={date} />}
  </main>;
}
