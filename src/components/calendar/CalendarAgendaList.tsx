import { Link } from "@tanstack/react-router";
import type { CalendarFeedItem } from "@/modules/calendar/calendar.functions";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { calendarEventDetailsDestination } from "@/domain/calendar-view";
import { formatTime, typeLabel } from "./calendar-presentation";

/** One agenda renderer for day, agenda, and mobile month views. */
export function CalendarAgendaList({
  items, loading, heading, label, selection, className,
}: {
  items: readonly CalendarFeedItem[];
  loading: boolean;
  heading: string;
  label: string;
  selection: NonNullable<Parameters<typeof calendarEventDetailsDestination>[2]>;
  className?: string;
}) {
  return <section aria-label={label} className={"border border-border bg-card p-5" + (className ? " " + className : "")}>
    <h2 className="font-semibold">{heading}</h2>
    <ul className="mt-4 divide-y">{items.map(item=><li key={item.id} className="py-4">
      <Link {...calendarEventDetailsDestination(item.id,dateKeyInTimezone(item.startsAt,item.timezone),selection)}
        className="font-semibold text-primary underline">{item.title}</Link>
      <p className="mt-1 text-sm text-muted-foreground">
        {dateKeyInTimezone(item.startsAt,item.timezone)} · {formatTime(item.startsAt,item.timezone)} · {item.timezone} · {typeLabel(item)}{item.cancelled?" · Cancelled":""}
      </p>
    </li>)}</ul>
    {!items.length&&!loading&&<p className="mt-4 text-sm text-muted-foreground">No events match this calendar view.</p>}
  </section>;
}
