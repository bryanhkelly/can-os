import { Link } from "@tanstack/react-router";
import { CalendarDays, FileText, MessageCircle, Users } from "lucide-react";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import { formatCalendarDateTime } from "@/components/calendar/calendar-presentation";
import type { StudentSuccessPriorities } from "@/domain/student-success";
import type { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import type { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";

type ClassEvent = Awaited<ReturnType<typeof getMyStudentToday>>["events"][number];
type CommunityEvent = Awaited<ReturnType<typeof getSchoolExperiences>>["events"][number];

/** Shared student dashboard glance, reading canonical assignment and
 * published school-event projections without inferring presence or mastery.
 */
export function StudentTodayAtGlance({
  localDate, classesToday, upcomingEvents, plan, assignmentsError,
}: {
  localDate: string;
  classesToday: readonly ClassEvent[];
  upcomingEvents: readonly CommunityEvent[];
  plan: StudentSuccessPriorities;
  assignmentsError: string | null;
}) {
  const textLink = "student-dashboard-link";
  return <DashboardPanel title="Today at a Glance" action={<Link to="/calendar" search={{date:localDate}} className={textLink}>View calendar →</Link>}>
          <div className="student-glance">
            <a href="#student-schedule"><CalendarDays aria-hidden="true" /><span><b>{classesToday.length} Classes Today</b><small>{classesToday[0] ? formatCalendarDateTime(classesToday[0].startsAt,classesToday[0].timezone) : "No scheduled class events today."}</small></span></a>
            <a href="#student-assignments"><FileText aria-hidden="true" /><span><b>{assignmentsError ? "Assignments unavailable" : `${plan.requiresAction} Assignments to Review`}</b><small>{assignmentsError ?? `${plan.dueSoon} due soon · ${plan.overdue} overdue · ${plan.revise} revisions`}</small></span></a>
            <Link to="/messages"><MessageCircle aria-hidden="true" /><span><b>Messages</b><small>Open your school conversations</small></span></Link>
            <a href="#school-life"><Users aria-hidden="true" /><span><b>{upcomingEvents[0]?.title ?? "School Life"}</b><small>{upcomingEvents[0] ? formatCalendarDateTime(upcomingEvents[0].startsAt,upcomingEvents[0].timezone) : "Explore your school's community"}</small></span></a>
          </div>
        </DashboardPanel>;
}
