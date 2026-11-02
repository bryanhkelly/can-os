import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deriveStudentSuccessPriorities } from "@/domain/student-success";
import { StudentSuccessPriorityPanel } from "@/components/student/StudentSuccessPriorityPanel";

vi.mock("@tanstack/react-router", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  Link: ({ to, search, children, ...props }: {
    to: string; search?: Record<string, string | undefined>; children: ReactNode;
  }) => <a href={to + (search ? "?" + new URLSearchParams(
    Object.entries(search).filter((item): item is [string,string] => item[1] !== undefined),
  ).toString() : "")} {...props}>{children}</a>,
}));

describe("Student Success priority navigation", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const assignments = [
    { assessmentId:"math-work",sectionId:"section-math",title:"Complete fractions",course:"Mathematics",
      dueAt:"2026-10-21T12:00:00Z",status:null,timeliness:null,assessmentStatus:"published",canEdit:true },
    { assessmentId:"science-work",sectionId:"section-science",title:"Revise lab report",course:"Science",
      dueAt:null,status:"returned",timeliness:"late",assessmentStatus:"published",canEdit:true },
    { assessmentId:"english-work",sectionId:"section-english",title:"Essay submitted",course:"English",
      dueAt:"2026-10-22T14:00:00Z",status:"submitted",timeliness:"on_time",assessmentStatus:"published",canEdit:true },
  ];

  it("shows next steps across multiple enrolled courses with exact assignment links", () => {
    const plan = deriveStudentSuccessPriorities(assignments, now);
    const html = renderToStaticMarkup(<StudentSuccessPriorityPanel plan={plan} />);
    expect(html).toContain("Your next learning steps");
    expect(html).toContain("Revisions: 1");
    expect(html).toContain("Overdue: 1");
    expect(html).toContain("Awaiting feedback: 1");
    expect(html).toContain("Revise lab report");
    expect(html).toContain("Complete fractions");
    expect(html).toContain("Essay submitted");
    expect(html).toContain('href="/student/assignments?assessment=science-work&amp;section=section-science"');
    expect(html).toContain('href="/student/assignments?assessment=math-work&amp;section=section-math"');
    expect(html).toContain('href="/student/support"');
  });

  it("never treats assignment unavailability as an empty or successful school day", () => {
    const html = renderToStaticMarkup(<StudentSuccessPriorityPanel plan={null} />);
    expect(html).toContain("could not be loaded");
    expect(html).toContain('href="/student/assignments"');
    expect(html).not.toContain("No published assignments currently need follow-up");
  });

  it("does not include private case notes, counseling records or activity-based diagnoses", () => {
    const html = renderToStaticMarkup(<StudentSuccessPriorityPanel
      plan={deriveStudentSuccessPriorities(assignments,now)} />);
    expect(html).not.toContain("counseling case");
    expect(html).not.toContain("at-risk student");
    expect(html).not.toContain("learning mastery achieved");
  });
});
