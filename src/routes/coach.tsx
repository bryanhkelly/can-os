import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { useEffect, useState } from "react";
import {
  getCoachCaseload,
  getCoachStudentHistory,
  logCoachOutreach,
} from "@/modules/support/coach.functions";

export const Route = createFileRoute("/coach")({
  validateSearch: (search: Record<string,unknown>):{student?:string}=>({student:typeof search.student==="string"?search.student:undefined}),
  component:()=>{const search=Route.useSearch();const navigate=Route.useNavigate();
    return <CoachPage key={search.student??"all"} studentProfileId={search.student}
      selectStudent={student=>void navigate({search:{student}})}/>;},
});

type CaseloadStudent = Awaited<ReturnType<typeof getCoachCaseload>>["students"][number];
type TimelineEntry = Awaited<ReturnType<typeof getCoachStudentHistory>>["timeline"][number];

const outcomes = [
  { value: "contacted", label: "Contacted" },
  { value: "meeting_scheduled", label: "Meeting scheduled" },
  { value: "escalated", label: "Escalated" },
  { value: "no_response", label: "No response" },
] as const;

export function CoachPage({studentProfileId,selectStudent,title="Specialist caseload"}:{
  studentProfileId?:string;selectStudent:(id:string)=>void;title?:string;
}) {
  const [students, setStudents] = useState<CaseloadStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selected = studentProfileId ?? null;
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<(typeof outcomes)[number]["value"]>("contacted");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [historyError,setHistoryError]=useState("");

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
    setTimeline([]);setHistoryError("");
    getCoachStudentHistory({ data: { studentProfileId: selected } })
      .then((result) => {
        if (!active) return;
        setTimeline(result.timeline);
        setTimelineLoading(false);
      })
      .catch((cause) => {
        if (!active) return;
        setTimeline([]);setHistoryError(cause instanceof Error?cause.message:"Unable to load student history.");
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
    <WorkspaceShell width="wide" eyebrow="CAN OS · Student support" title={title}
      actions={<Link to="/support" className="rounded-lg border px-4 py-2 text-sm">Referrals, plans & services</Link>}>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Students at your sites with open referrals, support plans, insights, or actions — sorted by what needs attention first.
        </p>
        {loading && <p className="mt-8 text-sm" role="status">Loading caseload…</p>}
        {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
        {!loading&&!error&&selected&&!chosen&&<p role="alert" className="mt-5 rounded-lg border p-4 text-sm">This student is unavailable in your current caseload.</p>}
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
                      selectStudent(student.studentProfileId);
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
                  <Link to="/staff/students/$personId" params={{personId:chosen.personId}} className="mt-3 inline-block text-sm underline">Open student profile</Link>
                  <p className="mt-3 text-xs text-muted-foreground">School-support records only. Do not enter clinical or private counseling notes.</p>
                  <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>
                  {historyError&&<p role="alert" className="mt-3 text-sm">{historyError}</p>}
                  {timelineLoading && <p className="mt-3 text-sm" role="status">Loading history…</p>}
                  {!timelineLoading && !historyError && timeline.length === 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">No recorded history yet.</p>
                  )}
                  <ol className="mt-3 space-y-3">
                    {timeline.map((entry) => (
                      <li key={`${entry.kind}-${entry.id}`} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-semibold">{entry.title}</p>
                          {entry.kind==="referral"&&<Link to="/support" search={{referral:entry.id}} className="text-xs underline">Open referral</Link>}
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
    </WorkspaceShell>
  );
}
