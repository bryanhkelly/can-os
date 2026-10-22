import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deriveStudentSuccessSupportTasks } from "@/domain/student-success-support";
import { StudentSuccessSupportPanel } from "@/components/student/StudentSuccessSupportPanel";

vi.mock("@tanstack/react-router", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  Link: ({ to, search, children, ...props }: {
    to: string; search?: Record<string, string | undefined>; children: ReactNode;
  }) => <a href={to + (search ? "?" + new URLSearchParams(
    Object.entries(search).filter((item): item is [string,string] => item[1] !== undefined),
  ).toString() : "")} {...props}>{children}</a>,
}));

const actions = [
  { id: "student-help", type: "student_support_request", status: "open", title: "Ask for math help",
    dueAt: null, subjectType: "student_profile", subjectId: "student-1" },
  { id: "teacher-shared", type: "student_support", status: "in_progress", title: "Meet with your tutor",
    dueAt: "2026-10-25T15:00:00Z", subjectType: "student_profile", subjectId: "student-1" },
  { id: "revision", type: "student_recovery", status: "waiting", title: "Revise fractions",
    dueAt: "2026-10-24T15:00:00Z", subjectType: "assessment", subjectId: "assessment-fractions" },
  { id: "private-case", type: "support_referral", status: "open", title: "Restricted counseling allegations",
    dueAt: null, subjectType: "student_profile", subjectId: "student-1" },
  { id: "internal-teacher", type: "academic_intervention", status: "open", title: "Private teacher assessment",
    dueAt: null, subjectType: "student_profile", subjectId: "student-1" },
  { id: "safety", type: "safeguarding_concern", status: "open", title: "Private safety record",
    dueAt: null, subjectType: "student_profile", subjectId: "student-1" },
  { id: "completed", type: "student_support", status: "resolved", title: "Already completed",
    dueAt: null, subjectType: "student_profile", subjectId: "student-1" },
];

describe("Student Success support-task confidentiality", () => {
  it("includes student-owned, supported academic actions without staff-only case types", () => {
    const result = deriveStudentSuccessSupportTasks(actions);
    expect(result.total).toBe(3);
    expect(result.tasks.map(task=>task.id)).toEqual(["revision", "teacher-shared", "student-help"]);
    const serialized = JSON.stringify(result);
    for (const secret of ["Restricted counseling", "Private teacher assessment", "Private safety"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("links student-visible assignments and owned support actions to exact workflows", () => {
    const html = renderToStaticMarkup(<StudentSuccessSupportPanel
      support={deriveStudentSuccessSupportTasks(actions)} />);
    expect(html).toContain("Your learning support");
    expect(html).toContain('href="/student/assignments?assessment=assessment-fractions"');
    expect(html).toContain('href="/student/experiences?action=student-help"');
    expect(html).toContain('href="/student/experiences?action=teacher-shared"');
    expect(html).not.toContain("Restricted counseling allegations");
    expect(html).not.toContain("Private teacher assessment");
    expect(html).not.toContain("Private safety record");
  });

  it("keeps unavailable data distinct from no outstanding tasks", () => {
    const unavailable = renderToStaticMarkup(<StudentSuccessSupportPanel support={null} />);
    expect(unavailable).toContain("temporarily unavailable");
    expect(unavailable).not.toContain("No outstanding");
    const empty = renderToStaticMarkup(<StudentSuccessSupportPanel support={{
      tasks: [], total: 0, truncated: false,
    }} />);
    expect(empty).toContain("No outstanding student-owned support actions");
  });

  it("shows recently teacher-reviewed goals while keeping unreviewed resolutions hidden", () => {
    const now = new Date("2026-10-22T19:00:00.000Z");
    const feedback = "The submitted mathematics solution demonstrates all the practice steps.";
    const result = deriveStudentSuccessSupportTasks([
      ...actions,
      { id: "verified-goal", type: "student_learning_goal", status: "resolved",
        title: "Practice two-step equations", dueAt: null,
        resolvedAt: "2026-10-22T18:00:00.000Z",
        review: { outcome: "met", reviewedAt: "2026-10-22T18:00:00.000Z",
          studentFeedback: feedback },
        subjectType: "student_profile", subjectId: "student-1" },
      { id: "unverified-goal", type: "student_learning_goal", status: "resolved",
        title: "No grade reviewed", dueAt: null,
        resolvedAt: "2026-10-22T18:00:00.000Z",
        subjectType: "student_profile", subjectId: "student-1" },
      { id: "old-goal", type: "student_learning_goal", status: "resolved",
        title: "Old completed goal", dueAt: null,
        resolvedAt: "2026-05-01T18:00:00.000Z",
        review: { outcome: "met", reviewedAt: "2026-05-01T18:00:00.000Z",
          studentFeedback: feedback },
        subjectType: "student_profile", subjectId: "student-1" },
    ], 10, now);
    const item = result.tasks.find(task => task.id === "verified-goal");
    expect(item).toMatchObject({
      status: "resolved", goalOutcome: "met", studentFeedback: feedback,
    });
    expect(result.tasks.some(task=>task.id==="old-goal")).toBe(false);
    expect(result.tasks.some(task=>task.id==="unverified-goal")).toBe(false);
    const html = renderToStaticMarkup(<StudentSuccessSupportPanel support={result} />);
    expect(html).toContain("Goal met after teacher review");
    expect(html).toContain(feedback);
    expect(html).not.toContain("No grade reviewed");
  });

  it("bounds the queue, skips completed and duplicate actions, and never exposes metadata", () => {
    const many = [...actions, ...actions, ...Array.from({length: 8},(_,i)=>({
      ...actions[0]!, id: "more-"+i,
    }))];
    const plan = deriveStudentSuccessSupportTasks(many, 2);
    expect(plan.total).toBe(11);
    expect(plan.tasks).toHaveLength(2);
    expect(plan.truncated).toBe(true);
    expect(() => deriveStudentSuccessSupportTasks(actions, 0)).toThrow();
  });
});
