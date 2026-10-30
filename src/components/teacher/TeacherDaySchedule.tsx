import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getCalendarRange } from "@/modules/calendar/calendar.functions";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";

type Schedule = Awaited<ReturnType<typeof getCalendarRange>>;
type TeachingSection = { id: string; title: string };

export function TeacherDaySchedule({ sections }: { sections: TeachingSection[] }) {
  const [data, setData] = useState<Schedule | null>(null);
  const [error, setError] = useState(false);
  const [timezone, setTimezone] = useState("");
  useEffect(() => {
    let active = true;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    getCalendarRange({ data: { startsAt: start.toISOString(), endsAt: end.toISOString() } })
      .then(result => { if (active) setData(result); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return <TeacherDayScheduleView data={data} error={error} timezone={timezone} sections={sections} />;
}

export function TeacherDayScheduleView({ data, error, timezone, sections }: {
  data: Schedule | null; error: boolean; timezone: string; sections: TeachingSection[];
}) {
  const available = data?.connected && !error;
  const format = (instant: string) => new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || undefined, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(instant));
  return <section className="mt-10" aria-label="Today's schedule">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">Today's schedule</h2>
      <Link to="/calendar" search={{ view: "agenda" }} className="text-sm underline">Open calendar</Link>
    </div>
    {timezone && <p className="mt-2 text-xs text-muted-foreground">Today and times shown in {timezone}.</p>}
    {error || (data && !data.connected)
      ? <p role="status" className="mt-3 text-sm">Schedule unavailable. Try opening the calendar.</p>
      : !data && <p role="status" className="mt-3 text-sm">Loading schedule…</p>}
    {available && <>
      {data.truncated && <p role="status" className="mt-3 text-sm">This schedule is incomplete. Open the calendar to review additional events.</p>}
      {!data.items.length && !data.truncated && <p className="mt-3 text-sm">No calendar events scheduled for today.</p>}
      <div className="mt-4 grid gap-3">
        {data.items.map(item => {
          const section = sections.find(section => section.id === item.sectionId);
          return <article key={item.id} className="rounded-xl border p-4">
            {item.source === "assessment" && section
              ? <Link to="/teacher/gradebook" search={{ section: section.id, assessment: item.id.replace(/^assessment:/, "") }} className="font-semibold underline">{item.title}</Link>
              : <Link to="/calendar" search={{ date: dateKeyInTimezone(item.startsAt, item.timezone), event: item.id }} className="font-semibold underline">{item.title}</Link>}
            <p className="mt-1 text-sm">{format(item.startsAt)}{item.endsAt ? ` – ${format(item.endsAt)}` : ""}
              {item.cancelled ? " · Cancelled" : item.source === "assessment" ? " · Due" : ""}</p>
            {section && <Link to="/classes" search={{ section: section.id }} className="mt-2 inline-block text-sm underline">Open {section.title}</Link>}
          </article>;
        })}
      </div>
    </>}
  </section>;
}
