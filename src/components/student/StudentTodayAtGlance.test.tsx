import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StudentTodayAtGlance } from "./StudentTodayAtGlance";
import { deriveStudentSuccessPriorities } from "@/domain/student-success";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children,search:_search}: {
    to:string;children:ReactNode;search?:unknown;
  })=><a href={to}>{children}</a>,
}));
const base={
  localDate:"2026-11-19", classesToday:[], upcomingEvents:[],
  plan:deriveStudentSuccessPriorities([],new Date("2026-11-19T20:00:00.000Z")),
  assignmentsError:null,
};
describe("student Today at a Glance", () => {
  it("shows zero scheduled Classes without claiming a missed class", () => {
    const html=renderToStaticMarkup(<StudentTodayAtGlance {...base}/>);
    expect(html).toContain("0 Classes Today");
    expect(html).toContain("No scheduled class events today");
    expect(html).toContain("Explore your school's community");
    expect(html).not.toContain("Absent");
  });
  it("does not reclassify an unavailable assignment source as zero overdue items", () => {
    const html=renderToStaticMarkup(<StudentTodayAtGlance {...base}
      assignmentsError="Assignments unavailable"/>);
    expect(html).toContain("Assignments unavailable");
    expect(html).not.toContain("0 Assignments to Review");
  });
});
