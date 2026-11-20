import { Link } from "@tanstack/react-router";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import { DashboardMediaTile } from "@/components/workspace/dashboard-widgets";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { formatCalendarDateTime } from "@/components/calendar/calendar-presentation";
import type { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";

type Event = Awaited<ReturnType<typeof getSchoolExperiences>>["events"][number];

/** Read-only community event cards. Publication status comes from the
 * authorized source; absence of events does not imply a service failure.
 */
export function StudentSchoolLifePanel({
  events, unavailable,
}: {
  events: readonly Event[];
  unavailable: boolean;
}) {
  const textLink = "student-dashboard-link";
  return <DashboardPanel id="school-life" title="School Life"
        action={<Link to="/student/my-school" className={textLink}>View all →</Link>}>
        {unavailable ? <p role="alert" className="text-xs">School updates could not be loaded. <Link to="/student/my-school" className="underline">Open School Life to retry.</Link></p>
          : events.length ? <div className="student-life-grid">{events.slice(0,3).map(event =>
            <DashboardMediaTile key={event.id} title={event.title} subtitle={formatCalendarDateTime(event.startsAt,event.timezone)}
              className="student-life-tile"
              href={`/calendar?date=${dateKeyInTimezone(event.startsAt,event.timezone)}&event=${encodeURIComponent(event.id)}`} />)}</div>
            : <div className="space-y-3"><p role="status" className="text-xs text-muted-foreground">No upcoming school events are published.</p>
              <Link to="/student/my-school" className={textLink}>School &amp; community →</Link></div>}
      </DashboardPanel>;
}
