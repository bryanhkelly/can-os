import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AttendanceConfigurationNotice } from "@/components/operations/AttendanceConfigurationNotice";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, params, children }: {
    to: string; search?: Record<string, string>; params?: Record<string, string>; children: ReactNode;
  }) => <a href={to.replace("$programId", params?.programId ?? "") +
    (search ? "?" + new URLSearchParams(search) : "")}>{children}</a>,
}));
const program = { id: "program", siteId: "school", name: "School Program", missingCalendarDates: 0 };
function render(configuration: Parameters<typeof AttendanceConfigurationNotice>[0]["programs"][number]["configuration"],
  canConfigure = true) {
  return renderToStaticMarkup(<AttendanceConfigurationNotice
    programs={[{ ...program, configuration, missingCalendarDates: configuration === "missing_calendar" ? 1 : 0 }]}
    canConfigure={canConfigure} date="2030-11-02"/>);
}
describe("attendance setup handoff", () => {
  it.each(["configured", "not_onsite"] as const)("does not invent a setup failure for %s", configuration => {
    expect(render(configuration)).toBe("");
  });
  it.each([
    ["no_active_year", "create or activate the school year"],
    ["missing_calendar", "classify this date as instructional or non-instructional"],
    ["partial_calendar", "classify the missing academic calendar dates"],
    ["missing_schedule", "effective onsite instructional schedule"],
  ] as const)("explains %s and links to the same school's scoped setup", (configuration, explanation) => {
    const html = render(configuration);
    expect(html).toContain(explanation);
    expect(html).toContain("2030-11-02");
    expect(html).toContain("No presence or absence is inferred");
    expect(html).toContain('href="/operations/school-years?siteId=school&amp;programId=program"');
  });
  it("directs enrollment and delivery-pattern problems to their actual owners", () => {
    expect(render("no_active_enrollments")).toContain('href="/admissions/families?siteId=school&amp;programId=program"');
    expect(render("no_active_enrollments")).toContain("Creating a calendar does not enroll students");
    expect(render("onsite_pattern_mismatch")).toContain('href="/launch/school/program"');
    expect(render("onsite_pattern_mismatch")).not.toContain("/operations/school-years");
  });
  it("tells teachers who must act without suggesting they have registrar authority", () => {
    const html = render("missing_calendar", false);
    expect(html).toContain("school registrar");
    expect(html).toContain("Missing calendar dates: 1");
    expect(html).not.toContain("<a");
  });
});
