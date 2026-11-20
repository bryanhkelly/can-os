import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getCalendarRange } from "@/modules/calendar/calendar.functions";
import { dateKeyInTimezone, formatTimestamp } from "@/modules/calendar/timezone";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import { StatusBadge } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { calendarItemDestination } from "@/domain/calendar-view";

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
  const upcomingClass=data?.connected && !error
    ? data.items.filter(item=>item.source==="section" && !item.cancelled && item.sectionId && sections.some(section=>section.id===item.sectionId) &&
        Number.isFinite(Date.parse(item.startsAt)) && Date.parse(item.startsAt)>=Date.now())
        .sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))[0]
    : undefined;
  const upcomingSection=sections.find(section=>section.id===upcomingClass?.sectionId);
  // All calendar timestamps use the canonical, timezone-validated display helper.
  const displayTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const format = (instant: string) => formatTimestamp(instant, displayTimezone, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  return <DashboardPanel title="Today's schedule"
    action={<Link to="/calendar" search={{ view: "agenda" }} className="text-xs text-primary underline">Open calendar</Link>}>
    {timezone && <p className="mt-2 text-xs text-muted-foreground">Today and times shown in {timezone}.</p>}
    {error || (data && !data.connected)
      ? <p role="status" className="mt-3 text-sm">Schedule unavailable. Try opening the calendar.</p>
      : !data && <p role="status" className="mt-3 text-sm">Loading schedule…</p>}
    {upcomingClass&&upcomingSection&&<div className="mt-4 border border-primary/40 bg-card p-4" aria-label="Next scheduled class">
      <StatusBadge tone="info">Next scheduled class</StatusBadge>
      <p className="mt-1 font-semibold">{upcomingSection.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{format(upcomingClass.startsAt)}{upcomingClass.endsAt?` – ${format(upcomingClass.endsAt)}`:""}</p>
      <Button asChild size="sm" variant="outline" className="mt-3"><Link to="/class" >Open class workspace</Link></Button>
    </div>}
    {available && <>
      {data.truncated && <p role="status" className="mt-3 text-sm">This schedule is incomplete. Open the calendar to review additional events.</p>}
      {!data.items.length && !data.truncated && <p className="mt-3 text-sm">No calendar events scheduled for today.</p>}
      <div className="mt-4 grid gap-3">
        {data.items.map(item => {
          const section = sections.find(section => section.id === item.sectionId);
          const destination = calendarItemDestination(item, data.viewerRole);
          return <article key={item.id} className="border border-border bg-card p-4">
            {destination
              ? <Link {...destination} className="font-semibold underline">{item.title}</Link>
              : <Link to="/calendar" search={{ date: dateKeyInTimezone(item.startsAt, item.timezone), event: item.id }} className="font-semibold underline">{item.title}</Link>}
            <p className="mt-1 text-sm">{format(item.startsAt)}{item.endsAt ? ` – ${format(item.endsAt)}` : ""}
              </p>
            {item.cancelled ? <StatusBadge tone="danger">Cancelled</StatusBadge>
              : item.source === "assessment" ? <StatusBadge tone="attention">Due</StatusBadge> : null}
            {section && <Link to="/class"  className="mt-2 inline-block text-sm underline">Open {section.title}</Link>}
          </article>;
        })}
      </div>
    </>}
  </DashboardPanel>;
}
