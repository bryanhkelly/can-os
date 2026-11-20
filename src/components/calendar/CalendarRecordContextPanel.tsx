import { Link } from "@tanstack/react-router";
import { WorkspacePanel, StatusBadge } from "@/components/workspace";
import { typeLabel } from "@/components/calendar/calendar-presentation";
import { calendarRecordDestination } from "@/domain/calendar-view";
import type { CalendarFeedItem } from "@/modules/calendar/calendar.functions";

type RecordDestination = ReturnType<typeof calendarRecordDestination>;

/** Shared calendar source context. Record links must be resolved by the
 * caller using the current viewer's authorized role and student scope.
 */
export function CalendarRecordContextPanel({
  event, recordDestination,
}: {
  event: CalendarFeedItem;
  recordDestination: RecordDestination;
}) {
  return <WorkspacePanel title="Record context" className=" shadow-none">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calendar status</dt>
            <dd className="mt-1">
              <StatusBadge tone={event.cancelled ? "danger" : "neutral"}>{event.cancelled ? "Cancelled" : "On calendar"}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event type</dt>
            <dd className="mt-1">{typeLabel(event)}</dd>
          </div>
          {event.studyGroup && <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study group</dt>
            <dd className="mt-1">{recordDestination
              ? <Link {...recordDestination} className="text-primary underline">{event.studyGroup.title}</Link>
              : event.studyGroup.title}</dd>
          </div>}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time zone</dt>
            <dd className="mt-1">{event.timezone}</dd>
          </div>
        </dl>
      </WorkspacePanel>;
}
