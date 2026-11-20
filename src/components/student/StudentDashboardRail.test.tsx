import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StudentDashboardRail } from "./StudentDashboardRail";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children,search:_search}: {
    to:string;children:ReactNode;search?:unknown;
  })=><a href={to}>{children}</a>,
}));
vi.mock("@/components/workspace/dashboard-calendar", () => ({
  DashboardCalendar: ({date}: {date:string})=><div>Calendar {date}</div>,
}));

const base={localDate:"2026-11-19",timezone:"UTC",todayEvents:[]};
describe("student schedule and announcements rail", () => {
  it("distinguishes no published events or announcements from learner attendance", () => {
    const html=renderToStaticMarkup(<StudentDashboardRail {...base}/>);
    expect(html).toContain("No scheduled events today");
    expect(html).toContain("No announcements yet");
    expect(html).toContain("Calendar 2026-11-19");
    expect(html).not.toContain("Absent");
  });
  it("displays failed community queries as unavailable, not empty", () => {
    const html=renderToStaticMarkup(<StudentDashboardRail {...base}
      communityState={{ok:false,message:"Unavailable"} as never}/>);
    expect(html).toContain("Announcements could not be loaded");
    expect(html).not.toContain("No announcements yet");
  });
  it("preserves cancellation of scheduled events", () => {
    const event={
      id:"event-one",title:"Laboratory",startsAt:"2026-11-19T12:00:00.000Z",
      timezone:"UTC",cancelled:true,description:"Rescheduled",
    };
    const html=renderToStaticMarkup(<StudentDashboardRail {...base}
      todayEvents={[event] as never}/>);
    expect(html).toContain("Laboratory");
    expect(html).toContain("Cancelled");
  });
});
