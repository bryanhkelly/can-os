import { Link } from "@tanstack/react-router";
import { BookOpen, CalendarDays, FileText, MessageCircle, Users } from "lucide-react";
import { personShortName } from "@/domain/person-name";
import { deriveStudentSuccessPriorities } from "@/domain/student-success";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import type { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { DashboardLayout, DashboardPanel, DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { StudentContinueLearningPanel } from "./StudentContinueLearningPanel";
import { StudentDashboardRail } from "./StudentDashboardRail";
import { StudentUpcomingAssignments } from "./StudentUpcomingAssignments";
import { StudentReleasedGradesPanel } from "./StudentReleasedGradesPanel";
import { StudentSchoolLifePanel } from "./StudentSchoolLifePanel";
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
        <StudentContinueLearningPanel resume={learning}
          unavailable={Boolean(data && !data.learning.ok)}
          nextWork={nextWork} hasClasses={liveData.sections.length>0} />
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
          sections={liveData.sections} />
        <StudentReleasedGradesPanel state={data?.grades} />
      </div>
      <StudentSchoolLifePanel events={upcomingEvents}
        unavailable={Boolean(data && !data.community.ok)} />
    </>}
    rail={<StudentDashboardRail localDate={localDate} timezone={timezone}
      todayEvents={todayEvents} communityState={data?.community} />}
  />;
}
