import { SchoolDayPreparationPanel } from "@/components/operations/SchoolDayPreparationPanel";
import { getOnsiteSchoolDayPreparation } from "@/modules/operations/onsite-day-preparation.functions";
import { WorkspaceShell, StatCard, StatusBadge } from "@/components/workspace";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { useCallback, useEffect, useRef, useState } from "react";
import { OnsiteSupervisionPanel } from "@/components/operations/OnsiteSupervisionPanel";
import { OnsiteDayReconciliationPanel } from "@/components/operations/OnsiteDayReconciliationPanel";
import { OnsitePickupPanel } from "@/components/operations/OnsitePickupPanel";
import {
  getOnsiteStaffDayContext, getSiteDayOpeningStatuses, listExpectedOnsiteRoster,
  markExpectedOnsiteAttendance,
} from "@/modules/attendance/onsite-attendance-workflow.functions";

type Roster = Awaited<ReturnType<typeof listExpectedOnsiteRoster>>;
type Student = Roster["students"][number];
type OpeningStatuses = Awaited<ReturnType<typeof getSiteDayOpeningStatuses>>["statuses"];
const marks = ["present", "tardy", "absent"] as const;

const openingBlockerLabels: Record<string, string> = {
  operating_agreement: "the CAN–church service agreement is not current",
  opening_evidence: "required independently verified opening evidence is missing or expired",
  site_director: "no current verified site director is appointed",
};

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
  const [preparing,setPreparing]=useState(false);
  const [preparation,setPreparation]=useState<Awaited<ReturnType<typeof getOnsiteSchoolDayPreparation>>|null>(null);
  const [openings, setOpenings] = useState<OpeningStatuses>([]);
  const [schoolDayRevision, setSchoolDayRevision] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSequence=useRef(0);
  const load = useCallback(async (targetDate: string, prepare=false) => {
    const sequence=++loadSequence.current;
    setLoading(true); setError(""); setRoster(null); setPreparation(null);
    try {
      if(prepare){
        const result=await getOnsiteSchoolDayPreparation({data:{date:targetDate}});
        if(sequence===loadSequence.current)setPreparation(result);
      }else{
        const result=await listExpectedOnsiteRoster({data:{date:targetDate}});
        if(sequence===loadSequence.current)setRoster(result);
      }
    } catch {
      if(sequence!==loadSequence.current)return;
      setError(prepare?"Unable to load school-day preparation. Verify your current director appointment and calendar.":"Unable to load scheduled onsite attendance. Verify your active site membership and calendar.");
    } finally { if(sequence===loadSequence.current)setLoading(false); }
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
    // Opening status is an advisory banner; a failure here must not block the
    // roster, which reports its own hard failures.
    void getSiteDayOpeningStatuses().then(result => {
      if (active) setOpenings(result.statuses);
    }).catch(() => {});
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

  return <WorkspaceShell width="wide" eyebrow="CAN OS · Onsite school" title={context?.siteName ?? "Site Today"}
    subtitle="Supervise the scheduled school day and record staff-observed attendance. Learning activity is not physical presence.">
    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>{date || "Loading school date"}</span>
      {context && <span>{context.timeZone}</span>}
      <span>Attendance does not authorize student release.</span>
    </div>
    {openings.some(opening => opening.blocked) &&
      <section role="alert" aria-label="School opening status"
        className="mt-4 border-l-4 border-destructive bg-muted/40 px-5 py-4">
        <h2 className="font-semibold">School opening is not currently authorized</h2>
        <p className="mt-1 text-sm">
          A church-hosted school at this site is not approved to operate right now.
          Keep supervising and recording the day accurately — an attendance record is a
          historical fact, never authorization to operate. Contact the church registrar
          and your CAN school-opening officer.
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {openings.filter(opening => opening.blocked).map(opening => {
            const programName = roster?.programs.find(program => program.id === opening.programId)?.name;
            return <li key={opening.programId}>
              <span className="font-medium">{programName ?? "School program"}: </span>
              {opening.status === "suspended" ? "opening suspended by CAN" :
                opening.status === "approved" ? "approval prerequisites no longer hold" :
                opening.status === "unconfigured" ? "no approved school configuration exists" :
                "opening not yet approved"}
              {opening.blockers.length > 0 && " — " +
                opening.blockers.map(blocker => openingBlockerLabels[blocker] ?? blocker).join("; ")}
            </li>;
          })}
        </ul>
      </section>}
    <WorkflowIntro eyebrow="Site supervision · Attendance" title="A clear record of the onsite day." description="Record staff-observed attendance for your assigned site. Online learning activity is not proof of physical presence, and arrival marks do not authorize student release." />
    {context&&<nav aria-label="School day workflow" className="mt-5 flex flex-wrap gap-3">
      <button type="button" aria-pressed={!preparing} className="rounded border px-3 py-2 text-sm font-semibold"
        onClick={()=>{setPreparing(false);setDate(context.date);setNotice("");setNotes({});void load(context.date);}}>Operate today</button>
      {context.canPrepareSchoolDays&&<button type="button" aria-pressed={preparing} className="rounded border px-3 py-2 text-sm font-semibold"
        onClick={()=>{const day=new Date(context.date+"T12:00:00Z");day.setUTCDate(day.getUTCDate()+1);
          const target=day.toISOString().slice(0,10);setPreparing(true);setDate(target);setNotice("");setNotes({});void load(target,true);}}>Prepare tomorrow</button>}
      {!preparing&&<><a href="#attendance" className="px-2 py-2 text-sm underline">Record attendance</a>
        <a href="#supervision" className="px-2 py-2 text-sm underline">Staff duties and arrival</a>
        <a href="#pickup" className="px-2 py-2 text-sm underline">Student pickup</a>
        <a href="#day-review" className="px-2 py-2 text-sm underline">Reconcile the day</a></>}
    </nav>}
    {preparing&&<p role="status" className="mt-4 rounded border p-3 text-sm">Preparation mode — preview and plan only. Record attendance, physical arrival and student release in Operate today.</p>}
    {context && <label className="mt-6 block max-w-sm text-sm font-semibold">
      {preparing?"School-local preparation date":"School-local attendance date"}
      <input type="date" value={date} min={preparing?context.date:undefined} max={preparing?context.preparationThrough:context.date}
        className="mt-2 w-full rounded border bg-background p-3"
        onChange={event => {
          setDate(event.target.value); setNotice(""); setNotes({});
          if (event.target.value) void load(event.target.value,preparing);
        }} />
      <span className="mt-1 block text-xs text-muted-foreground">{context.timeZone}</span>
    </label>}
    {notice && <p role="status" className="mt-4 rounded border p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded border p-3 text-sm">{error}</p>}
    {loading && !error && <p role="status" className="mt-5 text-sm">Loading scheduled roster…</p>}
    {preparing&&preparation&&<SchoolDayPreparationPanel preparation={preparation} onChanged={()=>void load(date,true)}/>}
    {roster && !preparing && <>
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
      <section aria-label="Onsite day summary" className="mt-8">
        <h2 className="font-serif text-2xl font-semibold">Who's here</h2>
        <p className="mt-2 text-sm text-muted-foreground">Counts are student-program roster entries, not unique students. Only staff observations count as recorded attendance.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Expected roster entries" value={roster.students.length}/>
          <StatCard label="Staff-marked entries" value={roster.students.filter(student=>!["unmarked","expected"].includes(student.status)).length}/>
          <StatCard label="Needs attendance mark" value={roster.students.filter(student=>["unmarked","expected"].includes(student.status)).length}/>
        </div>
      </section>
      {roster.students.some(student=>["unmarked","expected"].includes(student.status))&&
        <section aria-label="Needs attention" className="mt-7 border-l-4 border-warning bg-muted/40 px-5 py-4">
          <h2 className="font-semibold">Needs attention</h2>
          <p className="mt-1 text-sm">Some expected roster entries have no staff-observed mark. Review the roster below; do not infer absence from an unmarked record.</p>
        </section>}
      <h2 id="attendance" className="mt-8 font-serif text-2xl font-semibold">Expected roster and attendance</h2>
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
              <StatusBadge tone={student.status==="present"?"success":student.status==="absent"?"attention":"neutral"}>{student.status.replaceAll("_"," ")}</StatusBadge>
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
    {roster && !preparing && <OnsitePickupPanel date={date} onChanged={() => void load(date)} />}
    {roster && !preparing && <div id="day-review"><OnsiteDayReconciliationPanel date={date} roster={roster} refreshRevision={schoolDayRevision} /></div>}
    {context && date && !preparing && <OnsiteSupervisionPanel date={date} onChanged={() => setSchoolDayRevision(revision => revision + 1)} />}
  </WorkspaceShell>;
}
