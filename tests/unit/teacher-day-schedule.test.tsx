import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TeacherDayScheduleView } from "@/components/teacher/TeacherDaySchedule";

vi.mock("@/modules/calendar/calendar.functions", () => ({ getCalendarRange: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children }: { to: string; search?: Record<string, string>; children: ReactNode }) =>
    <a href={to + "?" + new URLSearchParams(search)}>{children}</a>,
}));
const feed = { connected: true, viewerRole: "teacher" as const, items: [], truncated: false };
const render = (data: Parameters<typeof TeacherDayScheduleView>[0]["data"], error = false) =>
  renderToStaticMarkup(<TeacherDayScheduleView data={data} error={error} timezone="America/Los_Angeles" sections={[{ id: "english", title: "English" }]} />);

describe("Teacher Today schedule", () => {
  it("distinguishes loading, unavailable and a confirmed empty schedule", () => {
    expect(render(null)).toContain("Loading schedule");
    expect(render({ ...feed, connected: false })).toContain("Schedule unavailable");
    expect(render(feed, true)).not.toContain("No calendar events");
    expect(render(feed)).toContain("No calendar events scheduled for today");
    expect(render({ ...feed, truncated: true })).not.toContain("No calendar events");
  });

  it("links actual events and authorized classes, retaining cancellation and local times", () => {
    const html = render({ ...feed, items: [{ id: "event-1", title: "Seminar", type: "class_session", source: "section",
      startsAt: "2026-10-30T16:00:00Z", endsAt: "2026-10-30T17:00:00Z", timezone: "America/Los_Angeles",
      description: null, cancelled: true, manageable: false, sectionId: "english" }] });
    expect(html).toContain("Cancelled");
    expect(html).toContain("9:00 AM");
    expect(html).toContain("date=2026-10-30&amp;event=event-1");
    expect(html).toContain("/classes?section=english");
  });

  it("opens due work in its exact Section gradebook", () => {
    const html = render({ ...feed, items: [{ id: "assessment:essay", title: "Essay", type: "due_date", source: "assessment",
      startsAt: "2026-10-30T16:00:00Z", endsAt: null, timezone: "America/Los_Angeles",
      description: null, cancelled: false, manageable: false, sectionId: "english" }] });
    expect(html).toContain("/teacher/gradebook?section=english&amp;assessment=essay");
    expect(html).toContain(" · Due");
  });
});
