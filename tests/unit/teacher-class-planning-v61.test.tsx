import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClassTeacherPlanningPanel } from "@/components/learning/ClassTeacherPlanningPanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children }: { to: string; search?: Record<string, string>; children: ReactNode }) =>
    <a href={to + (search ? "?" + new URLSearchParams(search).toString() : "")}>{children}</a>,
}));
vi.mock("@/domain/first-class-lesson", () => ({
  isLearnerFacingInstruction: (item: { id: string }) => item.id === "published-lesson",
}));

type Props = Parameters<typeof ClassTeacherPlanningPanel>[0];
const publishedLesson = { id: "published-lesson", title: "Published investigation" };
const outlineLesson = { id: "outline-lesson", title: "Planned topic" };
const data = {
  role: "teacher", section: { id: "section-one" },
  roster: [{ id: "learner" }],
  assessmentEvidence: [{ id: "assessment-one", title: "Evidence reflection", curriculumLessonId: "published-lesson" }],
  lessonCompletionCounts: [{ lessonId: "published-lesson", studentCount: 1 }],
  content: { modules: [
    { id: "unit-one", title: "Investigations", lessons: [publishedLesson, outlineLesson] },
  ] },
} as unknown as Props["data"];
const lessons = [publishedLesson, outlineLesson] as unknown as Props["lessons"];

function render(workspace: Props["data"] = data) {
  return renderToStaticMarkup(<ClassTeacherPlanningPanel data={workspace} lessons={lessons}
    search={{ section: "section-one" }} />);
}

describe("V6.1 teacher class planning", () => {
  it("links the exact published lesson, teacher classwork and authorized assessment", () => {
    const html = render();
    expect(html).toContain("Class planning overview");
    expect(html).toContain("Published instruction");
    expect(html).toContain("Outline only");
    expect(html).toContain("1 linked released assignments");
    expect(html).toContain("1/1 learners self-reported complete");
    expect(html).toContain('href="/classes?section=section-one&amp;tab=lessons&amp;lesson=published-lesson"');
    expect(html).toContain('href="/teacher/gradebook?section=section-one&amp;lesson=published-lesson&amp;kind=classwork"');
    expect(html).toContain('href="/teacher/gradebook?section=section-one&amp;assessment=assessment-one"');
    expect(html).not.toContain("lesson=outline-lesson&amp;kind=classwork");
  });

  it("shows honest unavailable states without inventing lesson or enrollment data", () => {
    const empty = render({ ...data, content: null } as Props["data"]);
    expect(empty).toContain("No published curriculum is available");
    expect(empty).not.toContain("Create classwork");
    const unauthorized = render({ ...data, role: "student" } as Props["data"]);
    expect(unauthorized).toContain("available only to the assigned teaching team");
    expect(unauthorized).not.toContain("Published investigation");
  });
});
