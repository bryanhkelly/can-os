import { Link } from "@tanstack/react-router";
import type { CalendarFeedItem } from "@/modules/calendar/calendar.functions";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { calendarEventDetailsDestination } from "@/domain/calendar-view";
import { formatTime, typeLabel } from "./calendar-presentation";

type Selection = NonNullable<Parameters<typeof calendarEventDetailsDestination>[2]>;

/** Read-only week projection of the authorized calendar feed.
 * Event destinations resolve to the same calendar detail as day and agenda.
 */
export function CalendarWeekGrid({
  dates, byDay, selection, loading,
}: {
  dates: readonly string[];
  byDay: ReadonlyMap<string, readonly CalendarFeedItem[]>;
  selection: Selection;
  loading: boolean;
}) {
  return <section aria-label="Calendar week" className="grid grid-cols-1 border border-border bg-card md:grid-cols-7">
    {dates.map(day => <section key={day} aria-label={`Events on ${day}`}
      className="min-w-0 border-b border-border p-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <h3 className="border-b border-border pb-2 text-sm font-semibold">
        <Link to="/calendar" search={{...selection,view:"day",date:day,event:undefined}}
          className="text-primary underline">
          {new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric"})
            .format(new Date(`${day}T12:00:00Z`))}
        </Link>
      </h3>
      <ul className="divide-y divide-border">
        {(byDay.get(day)??[]).map(item=><li key={item.id} className="min-w-0 py-3 text-xs">
          <Link {...calendarEventDetailsDestination(item.id,dateKeyInTimezone(item.startsAt,item.timezone),selection)}
            className="block break-words font-semibold text-primary underline">{item.title}</Link>
          <p className="mt-1 break-words text-muted-foreground">
            {formatTime(item.startsAt,item.timezone)} · {typeLabel(item)}
            {item.cancelled?" · Cancelled":""}
          </p>
        </li>)}
      </ul>
      {!byDay.get(day)?.length&&!loading&&
        <p className="pt-3 text-xs text-muted-foreground">Nothing scheduled.</p>}
    </section>)}
  </section>;
}
