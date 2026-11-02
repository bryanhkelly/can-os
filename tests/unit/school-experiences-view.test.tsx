import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
  Link:({to,search,children,...props}:{to:string;search:Record<string,string>;children:ReactNode})=>
    <a href={to+"?"+new URLSearchParams(search)} {...props}>{children}</a>,
}));
vi.mock("@/modules/learning/guardian-academic-queries.functions", () => ({ getGuardianStudents: vi.fn() }));
vi.mock("@/modules/student-experience/school-experiences.functions", () => ({
  bookOfficeHour: vi.fn(), rescheduleOfficeHour: vi.fn(),
}));
vi.mock("@/modules/communication/notification-center.functions", () => ({ readNotification: vi.fn() }));

describe("School Experiences calendar status display", () => {
  const data = {
    connected: true as const, viewerRole: "student" as const, notices: [], slots: [], bookings: [],
    events: [],
  };

  it("uses family-facing language without exposing infrastructure status", () => {
    const html = renderToStaticMarkup(<LiveSchoolExperiences data={data}/>);
    expect(html).toContain("School &amp; community");
    expect(html).not.toContain("Neon");
  });

  it("labels cancelled events distinctly from scheduled events", () => {
    const html = renderToStaticMarkup(<LiveSchoolExperiences data={{
      connected: true, viewerRole: "student", notices: [], slots: [], bookings: [],
      events: [
        { id: "cancelled", title: "Cancelled assembly", startsAt: "2030-01-01T12:00:00Z", timezone: "UTC", status: "cancelled" },
        { id: "scheduled", title: "Upcoming assembly", startsAt: "2030-01-02T12:00:00Z", timezone: "UTC", status: "scheduled" },
      ],
    }} />);
    expect(html).toMatch(/Cancelled assembly[\s\S]*?>Cancelled<\/p>/);
    expect(html).toMatch(/Upcoming assembly[\s\S]*?>Scheduled<\/p>/);
    expect(html.match(/>Cancelled<\/p>/g)).toHaveLength(1);
    expect(html.match(/>Scheduled<\/p>/g)).toHaveLength(1);
  });

  it("explains unavailable information in plain language", () => {
    const html = renderToStaticMarkup(<LiveSchoolExperiences data={{ ...data, connected: false }}/>);
    expect(html).toContain("We couldn’t load current school information.");
    expect(html).not.toContain("Neon unavailable");
  });
});
