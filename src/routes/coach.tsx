import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getCoachCaseload,
  getCoachStudentHistory,
  logCoachOutreach,
} from "@/modules/support/coach.functions";

export const Route = createFileRoute("/coach")({ component: CoachPage });

type CaseloadStudent = Awaited<ReturnType<typeof getCoachCaseload>>["students"][number];
type TimelineEntry = Awaited<ReturnType<typeof getCoachStudentHistory>>["timeline"][number];

const outcomes = [
  { value: "contacted", label: "Contacted" },
  { value: "meeting_scheduled", label: "Meeting scheduled" },
  { value: "escalated", label: "Escalated" },
  { value: "no_response", label: "No response" },
] as const;

function CoachPage() {
  const [students, setStudents] = useState<CaseloadStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<(typeof outcomes)[number]["value"]>("contacted");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    getCoachCaseload()
      .then((result) => {
        if (!active) return;
        setStudents(result.students);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Sign in with an authorized specialist account.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setTimelineLoading(true);
    setTimeline([]);
    getCoachStudentHistory({ data: { studentProfileId: selected } })
      .then((result) => {
        if (!active) return;
        setTimeline(result.timeline);
        setTimelineLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setTimeline([]);
        setTimelineLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  const chosen = students.find((student) => student.studentProfileId === selected) ?? null;

  async function submitOutreach() {
    if (!selected) return;
    setBusy(true);
    setFormError("");
    setMessage("");
    try {
      await logCoachOutreach({ data: { studentProfileId: selected, note, outcome } });
      setMessage("Outreach logged.");
      setNote("");
      const [caseload, history] = await Promise.all([
        getCoachCaseload(),
        getCoachStudentHistory({ data: { studentProfileId: selected } }),
      ]);
      setStudents(caseload.students);
      setTimeline(history.timeline);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not log outreach");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Coach</p>
        <h1 className="mt-2 font-serif text-4xl">Caseload</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Students at your sites with open referrals, support plans, insights, or actions — sorted by what needs attention first.
        </p>
        {loading && <p className="mt-8 text-sm" role="status">Loading caseload…</p>}
        {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
        {!loading && !error && students.length === 0 && (
          <p className="mt-8 text-sm">No students currently need coach attention at your sites.</p>
        )}
        {!loading && !error && students.length > 0 && (
          <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <section>
              <div className="space-y-3">
                {students.map((student) => (
                  <button
                    key={student.studentProfileId}
                    onClick={() => {
                      setSelected(student.studentProfileId);
                      setMessage("");
                      setFormError("");
                    }}
                    className={`w-full rounded-xl border bg-card p-5 text-left hover:border-foreground/40 ${
                      selected === student.studentProfileId ? "border-foreground" : "border-border"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-base font-semibold">{student.name}</h2>
                      <span className="text-xs text-muted-foreground">
                        {student.gradeLevel ? `Grade ${student.gradeLevel}` : "Grade —"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {student.openReferrals > 0 && (
                        <span className="rounded-full bg-stone-warm px-2 py-1">
                          {student.openReferrals} open referral{student.openReferrals === 1 ? "" : "s"}
                          {student.latestReferralStage ? ` · ${student.latestReferralStage.replaceAll("_", " ")}` : ""}
                        </span>
                      )}
                      {student.hasOpenPlan && (
                        <span className="rounded-full bg-stone-warm px-2 py-1">Support plan</span>
                      )}
                      {student.openInsights > 0 && (
                        <span className="rounded-full bg-stone-warm px-2 py-1">
                          {student.openInsights} insight{student.openInsights === 1 ? "" : "s"}
                        </span>
                      )}
                      {student.openActions > 0 && (
                        <span className="rounded-full bg-stone-warm px-2 py-1">
                          {student.openActions} open action{student.openActions === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Last activity {new Date(student.lastActivityAt).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            </section>
            <section className="h-fit rounded-xl border bg-card p-5">
              {!chosen && <p className="text-sm text-muted-foreground">Select a student to see their timeline and log outreach.</p>}
              {chosen && (
                <>
                  <h2 className="font-serif text-2xl">{chosen.name}</h2>
                  <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>
                  {timelineLoading && <p className="mt-3 text-sm" role="status">Loading history…</p>}
                  {!timelineLoading && timeline.length === 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">No recorded history yet.</p>
                  )}
                  <ol className="mt-3 space-y-3">
                    {timeline.map((entry) => (
                      <li key={`${entry.kind}-${entry.id}`} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-semibold">{entry.title}</p>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.occurredAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                          {entry.kind.replaceAll("_", " ")}
                          {entry.outcome ? ` · ${entry.outcome.replaceAll("_", " ")}` : ""}
                          {` · ${entry.status.replaceAll("_", " ")}`}
                        </p>
                        {entry.detail && <p className="mt-2 text-sm text-muted-foreground">{entry.detail}</p>}
                        {entry.stageHistory && entry.stageHistory.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {entry.stageHistory.map((stage, index) => (
                              <li key={index}>
                                {stage.stage.replaceAll("_", " ")} · {new Date(stage.occurredAt).toLocaleDateString()}
                                {stage.note ? ` — ${stage.note}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                  <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Log outreach</h3>
                  <label className="mt-3 block text-sm font-semibold">
                    Note
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={4}
                      placeholder="Who did you contact, what was discussed, and what happens next?"
                      className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-semibold">
                    Outcome
                    <select
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value as typeof outcome)}
                      className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"
                    >
                      {outcomes.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  {formError && <p className="mt-3 rounded-lg border border-red-300 p-3 text-sm" role="alert">{formError}</p>}
                  {message && <p className="mt-3 rounded-lg border border-emerald-300 p-3 text-sm" role="status">{message}</p>}
                  <button
                    disabled={busy || note.trim().length < 3}
                    onClick={submitOutreach}
                    className="mt-4 w-full rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-40"
                  >
                    Log outreach
                  </button>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
