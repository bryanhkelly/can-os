import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TeacherNextActionPanel } from "./TeacherNextActionPanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

describe("teacher next-action panel", () => {
  it("prioritizes submitted work over missing-work follow-ups", () => {
    const html = renderToStaticMarkup(<TeacherNextActionPanel
      ungradedCount={2} missingWorkCount={3}
      nextUngraded={{ sectionId: "section-1", assessmentId: "assessment-1", studentProfileId: "student-1" }} />);
    expect(html).toContain("2 submitted work items to review");
    expect(html).toContain("Grade next submission");
    expect(html).not.toContain("Review missing work");
  });
  it("reuses the missing-work route when no grading is pending", () => {
    const html = renderToStaticMarkup(<TeacherNextActionPanel ungradedCount={0} missingWorkCount={1} />);
    expect(html).toContain("1 missing-work follow-up");
    expect(html).toContain("Review missing work");
  });
  it("retains the class workspace fallback when the queue is empty", () => {
    const html = renderToStaticMarkup(<TeacherNextActionPanel ungradedCount={0} missingWorkCount={0} />);
    expect(html).toContain("Open my classes");
    expect(html).not.toContain("Grade next submission");
  });
});
