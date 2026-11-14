import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecordedInstructorWorkspace, RecordedInstructorChoices, RecordedLessonCompletionAction, RecordedOfficialCourseLinks, RecordedPracticeHistory } from "@/components/learning/RecordedInstructorWorkspace";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children, className }: {
    to: string; search?: Record<string, string>; children: ReactNode; className?: string;
  }) => <a href={to + (search ? "?" + new URLSearchParams(search).toString() : "")}
    className={className}>{children}</a>,
}));
vi.mock("@/modules/learning/instructional-tracks.functions", () => ({
  completeRecordedCourseLesson: vi.fn(),
  getStudentRecordedInstructors: vi.fn(),
  getRecordedLessonInstruction: vi.fn(),
  getRecordedInstructorPracticeHistory: vi.fn(),
  getRecordedInstructionAssetDownload: vi.fn(),
  selectRecordedInstructor: vi.fn(),
  recordRecordedInstructorPractice: vi.fn(),
}));

describe("recorded instructor learner workspace", () => {
  it("presents the learner-owned recorded-teacher choice as distinct from official course records", () => {
    const html = renderToStaticMarkup(
      <RecordedInstructorWorkspace courseAttemptId="10000000-0000-4000-8000-000000000001" />,
    );
    expect(html).toContain('aria-label="Recorded instructor"');
    expect(html).toContain("Choose your recorded teacher");
    expect(html).toContain("Your lessons, assignments and grades stay with your course");
    expect(html).toContain("Loading recorded instruction");
    expect(html).not.toContain("Save practice");
  });
  it("shows a course-level completion action without tying progress to the instructor", () => {
    const available = renderToStaticMarkup(
      <RecordedLessonCompletionAction allowed={true} completed={false} waived={false} pending={false} onComplete={vi.fn()}/>,
    );
    expect(available).toContain("Mark lesson complete");
    expect(available).not.toContain("disabled");

    const completed = renderToStaticMarkup(
      <RecordedLessonCompletionAction allowed={true} completed={true} waived={false} pending={false} onComplete={vi.fn()}/>,
    );
    expect(completed).toContain("Lesson completed");
    expect(completed).toContain("disabled");

    const waived = renderToStaticMarkup(
      <RecordedLessonCompletionAction allowed={true} completed={false} waived={true}
        pending={false} onComplete={vi.fn()}/>,
    );
    expect(waived).toContain("Lesson waived");
    expect(waived).toContain("disabled");
    expect(waived).not.toContain("Mark lesson complete");

    const guardian = renderToStaticMarkup(
      <RecordedLessonCompletionAction allowed={false} completed={false} waived={false} pending={false} onComplete={vi.fn()}/>,
    );
    expect(guardian).toBe("");
    expect(guardian).not.toContain("Mark lesson complete");
  });

  it("keeps class lessons, assignments and grades linked to one canonical Section", () => {
    const html = renderToStaticMarkup(
      <RecordedOfficialCourseLinks sectionId="a1000000-0000-4000-8000-000000000123"/>,
    );
    expect(html).toContain("Official class lessons");
    expect(html).toContain("Assignments and feedback");
    expect(html).toContain("Grades");
    expect(html).toContain("/classes?section=a1000000-0000-4000-8000-000000000123&amp;tab=lessons");
    expect(html).toContain("/student/assignments?section=a1000000-0000-4000-8000-000000000123");
    expect(html).toContain("/student/courses?section=a1000000-0000-4000-8000-000000000123&amp;tab=grades");
  });

  it("retains separately labeled practice from both recorded instructors", () => {
    const html = renderToStaticMarkup(<RecordedPracticeHistory history={[
      {
        id: "practice-a",
        courseUnitId: "unit-1",
        courseUnitTitle: "Foundations",
        trackVersionId: "track-teacher-a",
        trackTitle: "Teacher A",
        answers: [{ promptKey: "q1", promptText: "Explain how you reached your answer", response: "I used the first approach." }],
        policyVersionId: "policy-1",
        scoreNumeric: null,
        recordedAt: new Date("2026-11-12T12:00:00Z"),
      },
      {
        id: "practice-b",
        courseUnitId: "unit-1",
        courseUnitTitle: "Foundations",
        trackVersionId: "track-teacher-b",
        trackTitle: "Teacher B",
        answers: [{ promptKey: "q2", promptText: "Try another solution", response: "I tried a different method." }],
        policyVersionId: "policy-1",
        scoreNumeric: null,
        recordedAt: new Date("2026-11-13T12:00:00Z"),
      },
    ]}/>);
    expect(html).toContain("2 saved practice attempts");
    expect(html).toContain("Teacher A");
    expect(html).toContain("Teacher B");
    expect(html).toContain("Foundations");
    expect(html).toContain("Explain how you reached your answer");
    expect(html).toContain("I used the first approach.");
    expect(html).toContain("Try another solution");
    expect(html).toContain("I tried a different method.");
    expect(html).toContain("Switching teachers does not erase this history");
  });

  it("shows switching restrictions while still letting a learner renew the same teacher", () => {
    const choices = [
      { trackVersionId: "teacher-a", presenterPersonId: "presenter-a",
        title: "Teacher A", policyVersionId: "new-policy", allowSwitching: false },
      { trackVersionId: "teacher-b", presenterPersonId: "presenter-b",
        title: "Teacher B", policyVersionId: "new-policy", allowSwitching: false },
    ];
    const html = renderToStaticMarkup(<RecordedInstructorChoices
      catalog={{
        choices, blocked: [],
        selection: { trackVersionId: "teacher-a", policyVersionId: "old-policy", revision: 1 },
      }}
      pending={false} onSelect={vi.fn()}/>);
    expect(html).toContain("Teacher A (renew selection)");
    expect(html).toContain("Teacher B (switching unavailable)");
    expect(html).toMatch(/<button(?=[^>]*disabled="")(?=[^>]*>Teacher B)/);
  });

  it("enables renewal of the same instructor while disabling an already-current selection", () => {
    const choice = {
      trackVersionId: "teacher-a",
      presenterPersonId: "presenter-a",
      title: "Teacher A",
      policyVersionId: "policy-2",
      allowSwitching: true,
    };
    const catalog = {
      choices: [choice],
      blocked: [],
      selection: { trackVersionId: "teacher-a", revision: 1, policyVersionId: "policy-1" },
    };
    const renewal = renderToStaticMarkup(
      <RecordedInstructorChoices catalog={catalog} pending={false} onSelect={vi.fn()}/>,
    );
    expect(renewal).toContain("Teacher A (renew selection)");
    expect(renewal).not.toContain("disabled");

    const current = renderToStaticMarkup(
      <RecordedInstructorChoices catalog={{
        ...catalog,
        selection: { ...catalog.selection, policyVersionId: "policy-2" },
      }} pending={false} onSelect={vi.fn()}/>,
    );
    expect(current).toContain("Teacher A (selected)");
    expect(current).toContain("disabled");
  });

});
