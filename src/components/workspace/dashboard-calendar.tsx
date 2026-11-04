import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardPanel } from "./dashboard-layout";

export function DashboardCalendar({ date, timezone }: { date: string; timezone: string }) {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year!, month! - 1, 1));
  const count = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const key = (value: Date) => value.toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  return <DashboardPanel title={label} className="student-calendar"
    action={<div className="flex items-center gap-1">
      <Link to="/calendar" search={{date:key(new Date(Date.UTC(year!, month! - 2, 1))),view:"month"}}
        aria-label="Previous month" className="student-calendar-control"><ChevronLeft aria-hidden="true" className="size-4" /></Link>
      <Link to="/calendar" search={{date:key(new Date(Date.UTC(year!, month!, 1))),view:"month"}}
        aria-label="Next month" className="student-calendar-control"><ChevronRight aria-hidden="true" className="size-4" /></Link>
    </div>}>
    <div className="grid grid-cols-7 gap-1 text-center text-xs">
      {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(name =>
        <abbr key={name} title={name} className="py-2 text-muted-foreground no-underline">{name.slice(0,2)}</abbr>)}
      {Array.from({ length:first.getUTCDay() }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length:count }, (_, index) => {
        const value = index + 1;
        const target = key(new Date(Date.UTC(year!, month! - 1, value)));
        return <Link key={target} to="/calendar" search={{date:target}}
          aria-label={new Intl.DateTimeFormat("en-US", { dateStyle:"full",timeZone:"UTC" }).format(new Date(`${target}T12:00:00Z`))}
          aria-current={value === day ? "date" : undefined}
          className="student-calendar-day">{value}</Link>;
      })}
    </div>
    <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Dates in {timezone}. Open a date for its authorized schedule.</p>
  </DashboardPanel>;
}
