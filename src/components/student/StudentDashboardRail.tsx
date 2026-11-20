import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import { DashboardCalendar } from "@/components/workspace/dashboard-calendar";
import { StatusBadge } from "@/components/workspace";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { formatCalendarDateTime } from "@/components/calendar/calendar-presentation";
import type { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import type { StudentDashboardData } from "./student-dashboard-data";

type Event = Awaited<ReturnType<typeof getMyStudentToday>>["events"][number];

/** One read-only rail for the learner's authorized schedule and announcements.
 * Source-specific absences and missing data are not treated as negative findings.
 */
export function StudentDashboardRail({
  localDate, timezone, todayEvents, communityState,
}: {
  localDate: string;
  timezone: string;
  todayEvents: readonly Event[];
  communityState?: StudentDashboardData["community"];
}) {
  const communityUnavailable = Boolean(communityState && !communityState.ok);
  const community = communityState?.ok ? communityState.data : null;
  const format = (stamp: Date | string, zone = timezone) => formatCalendarDateTime(stamp, zone);
  const textLink = "student-dashboard-link";
  return <>
      <DashboardCalendar date={localDate} timezone={timezone} />
      <DashboardPanel id="student-schedule" title="Today's Schedule"
        action={<Link to="/calendar" search={{date:localDate}} className={textLink}>View all →</Link>}>
        <div className="student-schedule">{todayEvents.slice(0,5).map(event => <article key={event.id}>
          <time dateTime={new Date(event.startsAt).toISOString()}>{new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",timeZone:event.timezone}).format(new Date(event.startsAt))}</time>
          <div><Link to="/calendar" search={{date:dateKeyInTimezone(new Date(event.startsAt).toISOString(),event.timezone),event:event.id}}
            className="text-xs font-semibold hover:underline">{event.title}</Link>
            {event.cancelled && <StatusBadge tone="attention">Cancelled</StatusBadge>}
            <p className="mt-1 text-3xs text-muted-foreground">{format(event.startsAt,event.timezone)} · {event.timezone}</p>
            {event.description && <p className="mt-1 text-xs text-muted-foreground">{event.description}</p>}
          </div>
        </article>)}</div>
        {!todayEvents.length && <p className="text-xs text-muted-foreground">No scheduled events today.</p>}
        {todayEvents.length > 5 && <p className="mt-2 text-xs text-muted-foreground">Open the calendar for all {todayEvents.length} events today.</p>}
      </DashboardPanel>
      <DashboardPanel title="Announcements">
        {communityUnavailable ? <p role="alert" className="text-xs">Announcements could not be loaded.</p>
          : community?.notices.length ? <div className="divide-y">{community.notices.slice(0,3).map(notice =>
            <Link key={notice.id} to="/notifications" search={{notification:notice.id}} className="student-announcement">
              <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0"><b className="block text-xs font-semibold">{notice.title}</b>
                <span className="mt-1 block text-3xs text-muted-foreground">{notice.acknowledged ? "Read" : "New"} · {notice.body}</span></span>
            </Link>)}</div> : <p role="status" className="text-xs text-muted-foreground">No announcements yet.</p>}
      </DashboardPanel>
    </>;
}
