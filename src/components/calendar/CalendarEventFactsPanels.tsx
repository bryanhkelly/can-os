import { Link } from "@tanstack/react-router";
import { WorkspacePanel } from "@/components/workspace";
import { formatEventDate, typeLabel } from "@/components/calendar/calendar-presentation";
import type { CalendarFeedItem } from "@/modules/calendar/calendar.functions";

/** Read-only, shared event facts for the calendar. No event mutation or
 * event attendance is inferred from scheduled event metadata.
 */
export function CalendarEventFactsPanels({
  event, eventTime,
}: {
  event: CalendarFeedItem;
  eventTime: string;
}) {
  return <>
<WorkspacePanel title="Event details" description="Schedule and description for this calendar event." className=" shadow-none">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</dt>
              <dd className="mt-1 text-sm">{formatEventDate(event.startsAt, event.timezone)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</dt>
              <dd className="mt-1 text-sm">{eventTime} <span className="text-muted-foreground">{event.timezone}</span></dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</dt>
              <dd className="mt-1 text-sm">{typeLabel(event)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
              <dd className="mt-1 text-sm">{event.cancelled ? "Cancelled" : "On calendar"}</dd>
            </div>
            {!!event.teachers?.length && <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {event.teachers.length > 1 ? "Teachers" : "Teacher"}
              </dt>
              <dd className="mt-1 text-sm">{event.teachers.map((teacher, index) => <span key={teacher.personId}>
                {index > 0 && ", "}<Link to="/profiles" search={{ person: teacher.personId }} className="underline underline-offset-2">{teacher.name}</Link>
              </span>)}</dd>
            </div>}
          </dl>
        </WorkspacePanel>
        <WorkspacePanel title="Description" className=" shadow-none">
          <p className="whitespace-pre-wrap text-sm leading-6">
            {event.description || "No additional description has been provided."}
          </p>
        </WorkspacePanel>
  </>;
}
