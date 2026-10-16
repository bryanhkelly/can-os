import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { listGuardianAbsences, submitExcuse } from "@/modules/attendance/attendance.functions";

export const Route = createFileRoute("/guardian/attendance")({ component: GuardianAttendancePage });

type Absence = Awaited<ReturnType<typeof listGuardianAbsences>>["absences"][number];

function GuardianAttendancePage() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listGuardianAbsences();
      setAbsences(result.absences);
    } catch {
      setAbsences([]);
      setError("Sign in with an authorized guardian account to review attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listGuardianAbsences().then(result => {
      if (!active) return;
      setAbsences(result.absences);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setAbsences([]);
      setError("Sign in with an authorized guardian account to review attendance.");
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const submit = async (absence: Absence) => {
    setBusy(absence.attendanceEventId);
    setNotice("");
    try {
      await submitExcuse({
        data: { attendanceEventId: absence.attendanceEventId, reason: reasons[absence.attendanceEventId] ?? "" },
      });
      setNotice(`Excuse submitted for ${absence.studentName}.`);
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to submit excuse");
    } finally {
      setBusy("");
    }
  };

  const needsExcuse = absences.filter(absence => !absence.excuse && absence.status !== "excused");

  return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Attendance</p>
      <h1 className="mt-2 font-serif text-4xl">Attendance & excuses</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Review recent absences for your students and submit an excuse for the school to review.
      </p>
      {notice && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-8 rounded-lg border p-4 text-sm">{error}</p>}
      {loading && !error && <p role="status" className="mt-8 text-sm">Loading attendance…</p>}
      {!loading && !error && <>
        <div className="mt-6 grid grid-cols-3 gap-3" aria-label="Attendance summary">
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Recent absences</p><p className="mt-1 text-2xl font-semibold">{absences.length}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Needs an excuse</p><p className="mt-1 text-2xl font-semibold">{needsExcuse.length}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Excuses submitted</p><p className="mt-1 text-2xl font-semibold">{absences.filter(absence => absence.excuse).length}</p></div>
        </div>
        {absences.length === 0 && <p className="mt-8 text-sm">No recent absences or tardies were found for your students.</p>}
        {absences.length > 0 && <div className="mt-8 grid gap-4">
          {absences.map(absence => <section key={absence.attendanceEventId} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{absence.studentName}</h2>
                <p className="text-xs text-muted-foreground">{new Date(absence.expectedAt).toLocaleDateString()}</p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs capitalize">
                {absence.excuse ? `Excuse ${absence.excuse.status}` : absence.status}
              </span>
            </div>
            {absence.excuse && <div className="mt-3">
              <p className="rounded-lg bg-muted p-3 text-sm">Your excuse: {absence.excuse.reason}</p>
              {absence.excuse.status === "approved" && <p className="mt-2 text-sm">Approved — this day now counts as excused.</p>}
              {absence.excuse.status === "rejected" && <p className="mt-2 text-sm">Rejected by the school.{absence.excuse.reviewNote ? ` Note: ${absence.excuse.reviewNote}` : ""}</p>}
              {absence.excuse.status === "submitted" && <p className="mt-2 text-sm text-muted-foreground">Waiting for the school to review.</p>}
            </div>}
            {!absence.excuse && absence.status !== "excused" && <div className="mt-3">
              <label className="block text-sm font-semibold">
                Excuse reason
                <textarea
                  className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
                  rows={3}
                  value={reasons[absence.attendanceEventId] ?? ""}
                  onChange={event => setReasons(current => ({ ...current, [absence.attendanceEventId]: event.target.value }))}
                  placeholder="Tell the school why your student was absent"
                />
              </label>
              <button
                type="button"
                disabled={busy !== ""}
                className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => submit(absence)}
              >Submit excuse</button>
            </div>}
          </section>)}
        </div>}
      </>}
    </div>
  </main>;
}
