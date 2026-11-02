import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({}),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link:({to,search,children,...props}:{to:string;search:Record<string,string>;children:ReactNode})=>
    <a href={to+"?"+new URLSearchParams(search)} {...props}>{children}</a>,
}));
vi.mock("@/modules/learning/guardian-academic-queries.functions", () => ({ getGuardianStudents: vi.fn() }));
vi.mock("@/modules/student-experience/school-experiences.functions", () => ({
  bookOfficeHour: vi.fn(), rescheduleOfficeHour: vi.fn(), cancelOfficeHour: vi.fn(),
}));
vi.mock("@/modules/communication/notification-center.functions", () => ({ readNotification: vi.fn() }));

describe("School Experiences calendar status display", () => {
  it("labels cancelled events distinctly from scheduled events", () => {
    const html = renderToStaticMarkup(<LiveSchoolExperiences data={{
      connected: true, viewerRole: "student",
      notices: [{ id: "notice-1", title: "Synthetic announcement", body: "Synthetic update.", acknowledged: false }],
      slots: [], bookings: [],
      events: [
        { id: "cancelled", title: "Cancelled assembly", startsAt: "2030-01-01T12:00:00Z", timezone: "UTC", status: "cancelled" },
        { id: "scheduled", title: "Upcoming assembly", startsAt: "2030-01-02T12:00:00Z", timezone: "UTC", status: "scheduled" },
      ],
    }} />);
    expect(html).toMatch(/Cancelled assembly[\s\S]*?>Cancelled<\/span>/);
    expect(html).toMatch(/Upcoming assembly[\s\S]*?>Scheduled<\/span>/);
    expect(html.match(/>Cancelled<\/span>/g)).toHaveLength(1);
    expect(html.match(/>Scheduled<\/span>/g)).toHaveLength(1);
    expect(html).toContain('href="/calendar?date=2030-01-01&amp;event=cancelled"');
    expect(html).toContain("focus-visible:outline-2");
    expect(html).toContain("min-h-11");
  });
});
