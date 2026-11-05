import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { RoomCoverageWorkspace } from "@/components/operations/RoomCoverageWorkspace";
import { SchoolDayPreparationPanel } from "@/components/operations/SchoolDayPreparationPanel";
import { getOnsiteSchoolDayPreparation } from "@/modules/operations/onsite-day-preparation.functions";
import { QueryState, StatCard, StatusBadge } from "@/components/workspace";
import { DashboardHome } from "@/components/workspace/dashboard-home";
import { DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { DashboardCalendar } from "@/components/workspace/dashboard-calendar";
import { ClipboardList, ShieldCheck, Users, CalendarDays } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { getCalendarRange, type CalendarFeedItem } from "@/modules/calendar/calendar.functions";
import { addCalendarDays, dateKeyInTimezone, dateOnlyDayStartInTimezone, formatDateOnly, formatTimestamp } from "@/modules/calendar/timezone";
import { useState } from "react";
import { normalizeClientError } from "@/lib/client-error";
import { OnsiteSupervisionPanel } from "@/components/operations/OnsiteSupervisionPanel";
import { OnsiteDayReconciliationPanel } from "@/components/operations/OnsiteDayReconciliationPanel";
import { OnsitePickupPanel } from "@/components/operations/OnsitePickupPanel";
import { AttendanceConfigurationNotice } from "@/components/operations/AttendanceConfigurationNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function RoomUpcomingEvents({ date, timezone }: { date: string; timezone: string }) {
  const eventsQuery = useQuery({
    queryKey: ["site-day-upcoming-events", date, timezone],
    queryFn: async () => {
      const windows = [];
      for (let offset = 0; offset < 7; offset += 2) {
        const windowStart = addCalendarDays(date, offset);
        const windowEnd = addCalendarDays(date, Math.min(offset + 2, 7));
        windows.push(getCalendarRange({ data: {
          startsAt: dateOnlyDayStartInTimezone(windowStart, timezone).toISOString(),
          endsAt: dateOnlyDayStartInTimezone(windowEnd, timezone).toISOString(),
        } }));
      }
      const results = await Promise.all(windows);
      if (results.some(result => !result.connected)) throw new Error("Upcoming school events are unavailable");
      const unique = new Map<string, CalendarFeedItem>();
      for (const item of results.flatMap(result => result.items)) {
        const localDate = dateKeyInTimezone(item.startsAt, timezone);
        if ((item.source === "site" || item.source === "section") && localDate >= date &&
            localDate < addCalendarDays(date, 7)) unique.set(item.id, item);
      }
      return [...unique.values()].sort((left, right) => left.startsAt.localeCompare(right.startsAt)).slice(0, 8);
    },
    retry: (count, error) => normalizeClientError(error).retryable && count < 1,
  });
  const eventsFailure = eventsQuery.error
    ? normalizeClientError(eventsQuery.error, "Upcoming events are unavailable.") : null;

  return <section aria-labelledby="room-upcoming-heading" className="border-y py-4">
    <div className="flex items-center justify-between gap-3">
      <h2 id="room-upcoming-heading" className="font-semibold">Coming up</h2>
      <Link to="/calendar" className="text-sm underline">Full calendar</Link>
    </div>
    <QueryState loading={eventsQuery.isPending ? "Loading this week’s events…" : undefined}
      error={eventsFailure?.message} onRetry={eventsFailure?.retryable ? () => void eventsQuery.refetch() : undefined}
      retrying={eventsQuery.isFetching}/>
    {eventsQuery.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No school or room events are scheduled in the next seven days.</p>}
    {!!eventsQuery.data?.length && <ul className="mt-3 divide-y">
      {eventsQuery.data.map(item => <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0">
        <Link to="/calendar" search={{ date: dateKeyInTimezone(item.startsAt, timezone), event: item.id }} className="font-medium underline">{item.title}</Link>
        <span className="text-sm text-muted-foreground">{formatTimestamp(item.startsAt, item.timezone, {
          weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        })}</span>
      </li>)}
    </ul>}
  </section>;
}

/**
 * Onsite facilitator surface: one site and its scheduled school-day roster.
 * No family excuse details, counseling records, schoolwide action lists,
 * student grades, sign-out/release authorization, or local-storage PII.
 */
export function SiteDayPage({ selection }: { selection?: { siteId?: string; date?: string } } = {}) {
  const contextQuery = useQuery({
    queryKey: ["site-day-context"],
    queryFn: () => getOnsiteStaffDayContext(),
    retry: (count, error) => normalizeClientError(error).retryable && count < 1,
  });
  const context = contextQuery.data ?? null;
  const [dateOverride, setDateOverride] = useState<string>();
  const date = dateOverride ?? selection?.date ?? context?.date ?? "";
  const [preparing,setPreparing]=useState(false);
  const siteSelectionMismatch = Boolean(context && selection?.siteId && selection.siteId !== context.siteId);
  const futureAttendanceDate = Boolean(context && !preparing && date > context.date);
  const workspaceError = siteSelectionMismatch
    ? "This school does not match your verified onsite membership. Select the matching membership before operating the day."
    : futureAttendanceDate
      ? "Future dates are preparation only. Open the current school day to record attendance."
      : "";
  const noProgramNotice = context && !context.hasPrograms
    ? "No academic Program is configured for this school yet. Room assignments can be planned now; attendance requires linked classes and an approved calendar."
    : "";
  const dayQuery = useQuery({
    queryKey: ["site-day-records", context?.siteId, date, preparing],
    queryFn: async () => preparing
      ? { kind: "preparation" as const, data: await getOnsiteSchoolDayPreparation({ data: { date } }) }
      : { kind: "roster" as const, data: await listExpectedOnsiteRoster({ data: { date } }) },
    enabled: Boolean(context?.hasPrograms && date && !siteSelectionMismatch && !futureAttendanceDate),
    retry: (count, error) => normalizeClientError(error).retryable && count < 1,
  });
  const roster = dayQuery.data?.kind === "roster" ? dayQuery.data.data as Roster : null;
  const preparation = dayQuery.data?.kind === "preparation"
    ? dayQuery.data.data as Awaited<ReturnType<typeof getOnsiteSchoolDayPreparation>> : null;
  const openingQuery = useQuery({
    queryKey: ["site-day-opening-status", context?.siteId],
    queryFn: () => getSiteDayOpeningStatuses(),
    enabled: Boolean(context && !siteSelectionMismatch),
    retry: (count, error) => normalizeClientError(error).retryable && count < 1,
  });
  const openings: OpeningStatuses = openingQuery.data?.statuses ?? [];
  const contextFailure = contextQuery.error
    ? normalizeClientError(contextQuery.error, "Verify your onsite membership and try again.") : null;
  const dayFailure = dayQuery.error
    ? normalizeClientError(dayQuery.error, "Scheduled school-day records are unavailable.") : null;
  const [schoolDayRevision, setSchoolDayRevision] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async (targetDate: string, prepare = false) => {
    setError("");
    setPreparing(prepare);
    if (date !== targetDate) setDateOverride(targetDate);
    else if (preparing === prepare) await dayQuery.refetch();
  };

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
      setError(mutationErrorMessage(cause, "Unable to record attendance. Refresh and verify."));
    } finally { setBusy(""); }
  }

  return <DashboardHome eyebrow={context?.siteName ?? "Site Today"}
    subtitle="Supervise the scheduled school day and record staff-observed attendance. Learning activity is not physical presence."
    shortcuts={<>
      <DashboardShortcut title="Staff coverage" description="Review assigned supervision" icon={<Users className="size-5" />}><a href="#supervision" /></DashboardShortcut>
      <DashboardShortcut title="Attendance" description="Record staff-observed presence" icon={<ClipboardList className="size-5" />}><a href="#attendance" /></DashboardShortcut>
      <DashboardShortcut title="Verified pickup" description="Review student release checks" icon={<ShieldCheck className="size-5" />}><a href="#pickup" /></DashboardShortcut>
      <DashboardShortcut title="Day review" description="Reconcile the onsite day" icon={<CalendarDays className="size-5" />}><a href="#day-review" /></DashboardShortcut>
    </>}
    rail={context ? <DashboardCalendar date={date||context.date} timezone={context.timeZone} /> : undefined}
    actions={<><Link to="/safeguarding">Report a safety concern →</Link><Link to="/calendar">Open calendar →</Link></>}
    priority={<>
    {context?.canViewRoomCoverage && <RoomUpcomingEvents date={date || context.date} timezone={context.timeZone} />}
    {context?.canViewRoomCoverage && <RoomCoverageWorkspace/>}
    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>{date ? formatDateOnly(date) : "Loading school date"}</span>
      {context && <span>{context.timeZone}</span>}
      <span>Attendance does not authorize student release.</span>
    </div>
    {openingQuery.isPending && <p role="status" className="mt-4 rounded-xl border p-3 text-sm">Checking current school-opening authorization…</p>}
    {openingQuery.isError && <section role="alert" aria-label="School opening verification unavailable"
      className="mt-4 border-l-4 border-destructive bg-muted/40 px-5 py-4">
      <h2 className="font-semibold">School-opening status could not be verified</h2>
      <p className="mt-1 text-sm">The authorization summary is unavailable. Do not infer that this site is approved to operate. Contact the site director or CAN school-opening officer to verify before receiving students. Existing server-side restrictions still apply.</p>
      <Button type="button" variant="outline" className="mt-3" disabled={openingQuery.isFetching}
        onClick={() => void openingQuery.refetch()}>Retry opening-status check</Button>
    </section>}
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
    </>}>
    <WorkflowIntro eyebrow="Site supervision · Attendance" title="A clear record of the onsite day." description="Record staff-observed attendance for your assigned site. Online learning activity is not proof of physical presence, and arrival marks do not authorize student release." />
    {context?.hasPrograms&&<nav aria-label="School day workflow" className="mt-5 flex flex-wrap items-center gap-3">
      <Button variant={!preparing ? "secondary" : "outline"} aria-pressed={!preparing}
        onClick={()=>{setPreparing(false);setDateOverride(context.date);setNotice("");setNotes({});void load(context.date);}}>Operate today</Button>
      {context.canPrepareSchoolDays&&<Button variant={preparing ? "secondary" : "outline"} aria-pressed={preparing}
        onClick={()=>{const target=addCalendarDays(context.date,1);
          setPreparing(true);setDateOverride(target);setNotice("");setNotes({});void load(target,true);}}>Prepare tomorrow</Button>}
      {!preparing&&<><Button asChild variant="ghost" size="sm" className="underline">
          <a href="#supervision">1. Staff coverage</a>
        </Button>
        <Button asChild variant="ghost" size="sm" className="underline">
          <a href="#attendance">2. Record attendance</a>
        </Button>
        <Button asChild variant="ghost" size="sm" className="underline">
          <a href="#pickup">3. Verified pickup</a>
        </Button>
        <Button asChild variant="ghost" size="sm" className="underline">
          <a href="#day-review">4. Reconcile the day</a>
        </Button></>}
    </nav>}
    {preparing&&<p role="status" className="mt-4 rounded border p-3 text-sm">Preparation mode — preview and plan only. Record attendance, physical arrival and student release in Operate today.</p>}
    {context?.hasPrograms && <Label className="mt-6 block max-w-sm">
      {preparing?"School-local preparation date":"School-local attendance date"}
      <Input type="date" value={date} min={preparing?context.date:undefined} max={preparing?context.preparationThrough:context.date}
        className="mt-2"
        onChange={event => {
          setDateOverride(event.target.value); setNotice(""); setNotes({});
          if (event.target.value) void load(event.target.value,preparing);
        }} />
      <span className="mt-1 block text-xs text-muted-foreground">{context.timeZone}</span>
    </Label>}
    {(notice || noProgramNotice) && <p role="status" className="mt-4 rounded border p-3 text-sm">{notice || noProgramNotice}</p>}
    {(error || workspaceError) && <p role="alert" className="mt-4 rounded border p-3 text-sm">{error || workspaceError}</p>}
    <QueryState loading={!context && contextQuery.isPending ? "Loading your verified site workspace…" : undefined}
      error={!context && contextFailure?.message}
      onRetry={!context && contextFailure?.retryable ? () => void contextQuery.refetch() : undefined}
      retrying={contextQuery.isFetching}/>
    <QueryState loading={context && !workspaceError && dayQuery.isPending ? "Loading scheduled school-day records…" : undefined}
      error={!workspaceError && dayFailure?.message}
      onRetry={!workspaceError && dayFailure?.retryable ? () => void dayQuery.refetch() : undefined}
      retrying={dayQuery.isFetching}/>
    {preparing&&preparation&&<SchoolDayPreparationPanel preparation={preparation} onChanged={()=>void load(date,true)}/>}
    {roster && !preparing && <section aria-label="Today's operational steps" className="mt-7 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <h2 className="font-serif text-2xl font-semibold">Run today's school day</h2>
      <p className="mt-2 text-sm text-muted-foreground">Work through the current school day in order. These are navigation steps, not proof that opening, supervision, attendance, or custody requirements are satisfied.</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li><a href="#supervision" className="block min-h-24 rounded-xl border p-4 hover:bg-muted/40 focus-visible:outline-2">
          <span className="text-xs font-bold uppercase tracking-wide text-primary">1 · Coverage</span>
          <span className="mt-1 block font-semibold">Confirm staff and supervision</span>
          <span className="mt-1 block text-xs text-muted-foreground">Review scheduled duties and actual presence</span>
        </a></li>
        <li><a href="#attendance" className="block min-h-24 rounded-xl border p-4 hover:bg-muted/40 focus-visible:outline-2">
          <span className="text-xs font-bold uppercase tracking-wide text-primary">2 · Arrival</span>
          <span className="mt-1 block font-semibold">Record observed attendance</span>
          <span className="mt-1 block text-xs text-muted-foreground">{roster.students.filter(student=>["unmarked","expected"].includes(student.status)).length} student-program roster entries need a mark</span>
        </a></li>
        <li><a href="#pickup" className="block min-h-24 rounded-xl border p-4 hover:bg-muted/40 focus-visible:outline-2">
          <span className="text-xs font-bold uppercase tracking-wide text-primary">3 · Dismissal</span>
          <span className="mt-1 block font-semibold">Verify student pickup</span>
          <span className="mt-1 block text-xs text-muted-foreground">Use independent custody and release verification</span>
        </a></li>
        <li><a href="#day-review" className="block min-h-24 rounded-xl border p-4 hover:bg-muted/40 focus-visible:outline-2">
          <span className="text-xs font-bold uppercase tracking-wide text-primary">4 · Closeout</span>
          <span className="mt-1 block font-semibold">Review unresolved records</span>
          <span className="mt-1 block text-xs text-muted-foreground">Reconcile attendance and linked custody evidence</span>
        </a></li>
      </ol>
    </section>}
    {context?.hasPrograms && date && !preparing && <OnsiteSupervisionPanel date={date} onChanged={() => setSchoolDayRevision(revision => revision + 1)} />}
    {roster && !preparing && <>
      <p className="mt-3 text-xs text-muted-foreground">
        These are expected student-program attendance entries, not a deduplicated headcount or proof
        of physical presence until a staff member records the observation. Corrections are limited
        to the previous 30 days and must include a reason.
      </p>
      <AttendanceConfigurationNotice programs={roster.programs}
        canConfigure={roster.canConfigureAcademicYear} date={date}/>
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
              {marks.map(status => <Button key={status} type="button" size="sm"
                variant={student.status===status ? "secondary" : "outline"}
                disabled={!!busy || !date || date > (context?.date ?? "")}
                className="capitalize"
                onClick={() => void mark(student, status)}>
                Record {status}
              </Button>)}
            </div>
          </section>;
        })}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => void load(date)}
        className="mt-6 underline">Refresh school roster</Button>
    </>}
    {roster && !preparing && <OnsitePickupPanel date={date} onChanged={() => void load(date)} />}
    {roster && !preparing && <div id="day-review"><OnsiteDayReconciliationPanel date={date} roster={roster} refreshRevision={schoolDayRevision} /></div>}
  </DashboardHome>;
}
