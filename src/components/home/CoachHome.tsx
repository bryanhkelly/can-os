import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { Link } from "@tanstack/react-router";
import { DashboardHome } from "@/components/workspace/dashboard-home";
import { DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { CoachCaseloadList } from "@/components/support/CoachCaseloadList";
import { CoachStudentTimeline } from "@/components/support/CoachStudentTimeline";
import { Users, ClipboardList, CalendarDays, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getCoachCaseload,
  getCoachStudentHistory,
  logCoachOutreach,
} from "@/modules/support/coach.functions";

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
        setTimeline([]);setHistoryError(mutationErrorMessage(cause, "Unable to load student history."));
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
      setFormError(mutationErrorMessage(cause, "Could not log outreach"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardHome eyebrow={title}
      subtitle="Students at your sites with open referrals, support plans, insights, or actions — sorted by what needs attention first."
      shortcuts={<>
        <DashboardShortcut title="Caseload" description={loading?"Loading assigned students":error?"Caseload unavailable":`${students.length} students in scope`} icon={<Users className="size-5" />}><a href="#support-caseload" /></DashboardShortcut>
        <DashboardShortcut title="Referrals & plans" description="Review authorized support services" icon={<ClipboardList className="size-5" />}><Link to="/support" /></DashboardShortcut>
        <DashboardShortcut title="Calendar" description="Your authorized schedule" icon={<CalendarDays className="size-5" />}><Link to="/calendar" /></DashboardShortcut>
        <DashboardShortcut title="Messages" description="Coordinate student support" icon={<MessageCircle className="size-5" />}><Link to="/messages" /></DashboardShortcut>
      </>}
      actions={<><Link to="/support">Referrals, plans & services →</Link><Link to="/profiles">My profile →</Link></>}>
        <div id="support-caseload">
        {loading && <p className="mt-8 text-sm" role="status">Loading caseload…</p>}
        {error && <p className="mt-8  border p-4 text-sm" role="alert">{error}</p>}
        {!loading&&!error&&selected&&!chosen&&<p role="alert" className="mt-5  border p-4 text-sm">This student is unavailable in your current caseload.</p>}
        {!loading && !error && students.length === 0 && (
          <p className="mt-8 text-sm">No students currently need coach attention at your sites.</p>
        )}
        {!loading && !error && students.length > 0 && (
          <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <CoachCaseloadList students={students} selected={selected}
              onSelect={id=>{selectStudent(id);setMessage("");setFormError("");}} />
            <section className="h-fit  border bg-card p-5">
              {!chosen && <p className="text-sm text-muted-foreground">Select a student to see their timeline and log outreach.</p>}
              {chosen && (
                <>
                  <h2 className="font-serif text-2xl">{chosen.name}</h2>
                  <Link to="/staff/students/$personId" params={{personId:chosen.personId}} className="mt-3 inline-block text-sm underline">Open student profile</Link>
                  <p className="mt-3 text-xs text-muted-foreground">School-support records only. Do not enter clinical or private counseling notes.</p>
                  <CoachStudentTimeline entries={timeline} loading={timelineLoading} error={historyError}/>
                  <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Log outreach</h3>
                  <Label className="mt-3 block text-sm font-semibold">
                    Note
                    <Textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={4}
                      placeholder="Who did you contact, what was discussed, and what happens next?"
                      className="mt-2 w-full  border border-border bg-background p-3 text-sm"
                    />
                  </Label>
                  <Label className="mt-3 block text-sm font-semibold">
                    Outcome
                    <Select
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value as typeof outcome)}
                      className="mt-2 w-full  border border-border bg-background p-3 text-sm"
                    >
                      {outcomes.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Select>
                  </Label>
                  {formError && <p className="mt-3  border border-danger/40 p-3 text-sm" role="alert">{formError}</p>}
                  {message && <p className="mt-3  border border-success/40 p-3 text-sm" role="status">{message}</p>}
                  <Button type="submit" variant="ghost"
                    disabled={busy || note.trim().length < 3}
                    onClick={submitOutreach}
                    className="mt-4 w-full  bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-40"
                  >
                    Log outreach
                  </Button>
                </>
              )}
            </section>
          </div>
        )}
        </div>
    </DashboardHome>
  );
}
