import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TeacherFirstWeekCard } from "@/components/teacher/TeacherFirstWeekCard";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children }: { to: string; search?: Record<string, string>; children: ReactNode }) =>
    <a href={to + (search ? "?" + new URLSearchParams(Object.entries(search)).toString() : "")}>{children}</a>,
}));

const ready = {
  sectionId: "section-1", ready: true, blockers: [], activeStudentCount: 1,
  firstWeek: { lesson: { id: "intro", title: "Introductory investigation" }, assessment: { id: "assessment-1", title: "First response" } },
};

describe("authorized Teacher Today first-week handoff", () => {
  it("uses the assigned section's actual lesson and published assessment IDs", () => {
    const html = renderToStaticMarkup(<TeacherFirstWeekCard id="section-1" title="Biology" studentCount={1} classroom={ready} />);
    expect(html).toContain("First week: ready to teach");
    expect(html).toContain('href="/classes?section=section-1&amp;tab=lessons&amp;lesson=intro"');
    expect(html).toContain('href="/teacher/gradebook?section=section-1&amp;assessment=assessment-1"');
    expect(html).toContain('href="/classes?section=section-1&amp;tab=people"');
    expect(html).not.toContain("Create first assessment");
  });
  it("offers the canonical assessment creator instead of inventing student work", () => {
    const html = renderToStaticMarkup(<TeacherFirstWeekCard id="section-1" title="Biology" studentCount={0} classroom={{
      ...ready, ready: false, activeStudentCount: 0,
      blockers: [
        { key: "missing_assessment", message: "Publish an assessment with student instructions so learners can submit real work." },
        { key: "missing_students", message: "Assign at least one actively enrolled student to this class for the same program and school year." },
      ], firstWeek: { ...ready.firstWeek, assessment: null },
    }} />);
    expect(html).toContain("First week: needs attention");
    expect(html).toContain("Publish an assessment with student instructions");
    expect(html).toContain('href="/teacher/gradebook?section=section-1&amp;lesson=intro&amp;kind=classwork"');
    expect(html).not.toContain("Open first assessment");
  });
});
