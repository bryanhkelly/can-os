import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StudentUpcomingAssignments } from "./StudentUpcomingAssignments";
import type { DashboardAssignment } from "./student-dashboard-data";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
vi.mock("./StudentAssignmentLink", () => ({
  StudentAssignmentLink: ({children}: {children:ReactNode})=><div>{children}</div>,
}));

const defaults={
  assignments:[] as DashboardAssignment[],
  error:null,
  at:new Date("2026-11-19T20:00:00.000Z"),
  timezone:"UTC",
  sections:[],
};
describe("student assignment panel", () => {
  it("distinguishes no coursework from a failed service read", () => {
    const empty=renderToStaticMarkup(<StudentUpcomingAssignments {...defaults}/>);
    expect(empty).toContain("No published coursework in your current classes");
    const unavailable=renderToStaticMarkup(<StudentUpcomingAssignments {...defaults}
      error="Assignments unavailable."/>);
    expect(unavailable).toContain("Assignments unavailable.");
    expect(unavailable).not.toContain("No published coursework");
  });
  it("shows an editable overdue assignment as a continuation, not earned credit", () => {
    const item={
      assessmentId:"a-1",sectionId:"s-1",title:"Digital literacy practice",
      course:"AI skills",dueAt:"2026-11-18T20:00:00.000Z",
      status:"assigned",timeliness:"missing",canEdit:true,hasDraft:false,
    } as unknown as DashboardAssignment;
    const html=renderToStaticMarkup(<StudentUpcomingAssignments {...defaults} assignments={[item]}/>);
    expect(html).toContain("Digital literacy practice");
    expect(html).toContain("Missing");
    expect(html).toContain("Continue");
    expect(html).toContain("Due");
  });
});
