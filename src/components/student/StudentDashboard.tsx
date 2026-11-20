import { Link } from "@tanstack/react-router";
import { BookOpen, CalendarDays, Clock3, FileText, MessageCircle, Users } from "lucide-react";
import { personShortName } from "@/domain/person-name";
import { deriveStudentSuccessPriorities } from "@/domain/student-success";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import type { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { DashboardLayout, DashboardPanel, DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { DashboardProgress, DashboardMediaTile } from "@/components/workspace/dashboard-widgets";
import { StudentDashboardRail } from "./StudentDashboardRail";
import { StudentUpcomingAssignments } from "./StudentUpcomingAssignments";
import { StudentReleasedGradesPanel } from "./StudentReleasedGradesPanel";
import { formatCalendarDateTime } from "@/components/calendar/calendar-presentation";
import type { DashboardAssignment, StudentDashboardData } from "./student-dashboard-data";
import { StudentAssignmentLink } from "./StudentAssignmentLink";
import { DashboardHero, homeGreeting } from "@/components/workspace/dashboard-home";

type Today = Awaited<ReturnType<typeof getMyStudentToday>>;
const textLink = "student-dashboard-link";

export function StudentDashboard({ liveData, data }: { liveData: Today; data?: StudentDashboardData }) {
  const timezone = liveData.sections[0]?.timezone ?? liveData.events[0]?.timezone ?? "UTC";
  const at = new Date(liveData.generatedAt);
  const localDate = dateKeyInTimezone(at, timezone);
  const hour = Number(new Intl.DateTimeFormat("en-US", {hour:"numeric",hourCycle:"h23",timeZone:timezone}).format(at));
  const name = personShortName({preferredName:liveData.student.preferredName,legalFirstName:liveData.student.firstName});
  const assignments: DashboardAssignment[] = data?.assignments.ok ? data.assignments.data
    : data ? [] : liveData.coursework.map(item => ({
      assessmentId:item.assessmentId, sectionId:item.sectionId, title:item.assessmentTitle,
      course:liveData.sections.find(section => section.sectionId === item.sectionId)?.sectionTitle ?? "Class",
      dueAt:item.dueAt ? new Date(item.dueAt).toISOString() : null, status:item.status,
      timeliness:item.timeliness, assessmentStatus:"published", canEdit:false, hasDraft:false,
    }));
  const assignmentsError = data && !data.assignments.ok ? data.assignments.message : null;
  const plan = deriveStudentSuccessPriorities(assignments, at, 25);
  const nextWork = plan.steps.find(item => item.canEdit && ["revision","overdue","due_soon","to_do"].includes(item.kind));
  const learning = data?.learning.ok ? data.learning.data : null;
  const community = data?.community.ok ? data.community.data : null;
  const events = [...liveData.events].sort((a,b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const scheduled = events.filter(event => !event.cancelled);
  const todayEvents = events.filter(event => dateKeyInTimezone(event.startsAt, timezone) === localDate);
  const classesToday = scheduled.filter(event => Boolean(event.sectionId) && dateKeyInTimezone(event.startsAt, timezone) === localDate);
  const format = (stamp: Date | string, zone = timezone) => formatCalendarDateTime(stamp,zone);
  const upcomingEvents = community?.events.filter(event => event.status !== "cancelled" && new Date(event.startsAt) >= at)
    .sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) ?? [];
  return <DashboardLayout className="student-dashboard"
    wallpaper={<DashboardHero eyebrow="Your learning day" date={new Intl.DateTimeFormat("en-US", {
          weekday:"long",month:"short",day:"numeric",timeZone:timezone,
        }).format(at)} title={homeGreeting(hour, name)}
      subtitle={<><p>Your classes, your next step, and room to grow.</p>
        <p className="mt-2 text-xs">{timezone === "UTC" ? "UTC · school timezone not available" : timezone}</p>
      </>} />}
    quickActions={<>
      <DashboardShortcut title="Continue Learning" description={learning?.lesson?.title ?? nextWork?.title ?? "Open your enrolled classes"}
        icon={<BookOpen className="size-5" />}>{learning?.lesson
          ? <Link to="/classes" search={{section:learning.sectionId,tab:"lessons",lesson:learning.lesson.id}} />
          : nextWork ? <StudentAssignmentLink assessmentId={nextWork.assessmentId} sectionId={nextWork.sectionId} />
          : <Link to="/classes" />}</DashboardShortcut>
      <DashboardShortcut title="View Assignments" description={assignmentsError ? "Assignments unavailable" : `${plan.requiresAction} ready for your attention`}
        icon={<FileText className="size-5" />}><Link to="/student/assignments" /></DashboardShortcut>
      <DashboardShortcut title="Today's Schedule" description={`${classesToday.length} class events scheduled`}
        icon={<CalendarDays className="size-5" />}><Link to="/calendar" search={{date:localDate}} /></DashboardShortcut>
      <DashboardShortcut title="School Life" description="School events and community"
        icon={<Users className="size-5" />}><Link to="/student/my-school" /></DashboardShortcut>
    </>}
    primary={<>
      <div className="student-feature-grid">
        <DashboardPanel id="continue-learning" title="Continue Learning"
          action={learning?<Link to="/classes" search={{section:learning.sectionId,tab:"lessons"}} className={textLink}>View class →</Link>:
            <Link to="/classes" className={textLink}>View my classes →</Link>}>
          {learning ? <div className="student-resume-grid">
            <div>
              <div className="flex items-start gap-3">
                <div className="student-course-art" aria-hidden="true"><BookOpen className="size-8" /></div>
                <div className="min-w-0 flex-1"><h3 className="font-serif text-section leading-tight">{learning.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{learning.lesson?.title ?? "Published lessons reviewed"}</p>
                  {learning.total > 0 ? <DashboardProgress label="Self-reported lesson completion" value={learning.completed}
                    max={learning.total} className="mt-4" /> : <p className="mt-3 text-xs text-muted-foreground">No published instructional lessons available.</p>}
                </div>
              </div>
              {learning.lesson ? <Link to="/classes" search={{section:learning.sectionId,tab:"lessons",lesson:learning.lesson.id}}
                className="student-resume-action">Resume Lesson <span aria-hidden="true">→</span></Link>
                : <Link to="/classes" search={{section:learning.sectionId,tab:"lessons"}} className="student-resume-action">Review class →</Link>}
              <p className="mt-2 text-3xs text-muted-foreground">Self-reported completion is not mastery or earned credit.</p>
            </div>
            <div className="student-up-next">
              <p className="text-3xs font-semibold uppercase tracking-widest">Next up</p>
              <div className="mt-3 flex gap-2"><FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <p className="text-xs">{learning.lesson?.title ?? "Check your classwork and feedback"}</p></div>
              {learning.lesson?.estimatedMinutes && <div className="mt-3 flex gap-2"><Clock3 aria-hidden="true" className="size-4 shrink-0" />
                <p className="text-xs">About {learning.lesson.estimatedMinutes} min · estimated duration</p></div>}
              <Link to="/classes" search={{section:learning.sectionId,tab:"lessons"}} className="mt-4 block border bg-accent p-2 text-center text-xs font-semibold text-accent-foreground">View Course →</Link>
            </div>
          </div> : <div className="space-y-3">
            <p role="status" className="text-xs text-muted-foreground">{data && !data.learning.ok
              ? "Your lesson progress could not be loaded. Open your class to retry."
              : liveData.sections.length ? "Open a class to review its published lessons and next steps." : "No enrolled classes are available yet."}</p>
            {nextWork && <><p className="text-sm font-semibold">{nextWork.title}</p>
              <StudentAssignmentLink assessmentId={nextWork.assessmentId} sectionId={nextWork.sectionId}
                className="student-resume-action">Continue assignment →</StudentAssignmentLink></>}
            <Link to="/classes" className={textLink}>View my classes →</Link>
          </div>}
        </DashboardPanel>
        <DashboardPanel title="Today at a Glance" action={<Link to="/calendar" search={{date:localDate}} className={textLink}>View calendar →</Link>}>
          <div className="student-glance">
            <a href="#student-schedule"><CalendarDays aria-hidden="true" /><span><b>{classesToday.length} Classes Today</b><small>{classesToday[0] ? format(classesToday[0].startsAt,classesToday[0].timezone) : "No scheduled class events today."}</small></span></a>
            <a href="#student-assignments"><FileText aria-hidden="true" /><span><b>{assignmentsError ? "Assignments unavailable" : `${plan.requiresAction} Assignments to Review`}</b><small>{assignmentsError ?? `${plan.dueSoon} due soon · ${plan.overdue} overdue · ${plan.revise} revisions`}</small></span></a>
            <Link to="/messages"><MessageCircle aria-hidden="true" /><span><b>Messages</b><small>Open your school conversations</small></span></Link>
            <a href="#school-life"><Users aria-hidden="true" /><span><b>{upcomingEvents[0]?.title ?? "School Life"}</b><small>{upcomingEvents[0] ? format(upcomingEvents[0].startsAt,upcomingEvents[0].timezone) : "Explore your school's community"}</small></span></a>
          </div>
        </DashboardPanel>
      </div>
      <div className="student-feature-grid student-feature-lower">
        <StudentUpcomingAssignments assignments={assignments}
          error={assignmentsError} at={at} timezone={timezone}
          sections={liveData.sections} />rdPanel>
        <StudentReleasedGradesPanel state={data?.grades} />
      </div>
      <DashboardPanel id="school-life" title="School Life"
        action={<Link to="/student/my-school" className={textLink}>View all →</Link>}>
        {data && !data.community.ok ? <p role="alert" className="text-xs">School updates could not be loaded. <Link to="/student/my-school" className="underline">Open School Life to retry.</Link></p>
          : upcomingEvents.length ? <div className="student-life-grid">{upcomingEvents.slice(0,3).map(event =>
            <DashboardMediaTile key={event.id} title={event.title} subtitle={format(event.startsAt,event.timezone)}
              className="student-life-tile"
              href={`/calendar?date=${dateKeyInTimezone(event.startsAt,event.timezone)}&event=${encodeURIComponent(event.id)}`} />)}</div>
            : <div className="space-y-3"><p role="status" className="text-xs text-muted-foreground">No upcoming school events are published.</p>
              <Link to="/student/my-school" className={textLink}>School &amp; community →</Link></div>}
      </DashboardPanel>
    </>}
    rail={<StudentDashboardRail localDate={localDate} timezone={timezone}
      todayEvents={todayEvents} communityState={data?.community} />}
  />;
}
