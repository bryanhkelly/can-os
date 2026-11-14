import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecordedInstructorWorkspace, RecordedInstructorChoices, RecordedPracticeHistory } from "@/components/learning/RecordedInstructorWorkspace";

vi.mock("@/modules/learning/instructional-tracks.functions", () => ({
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
  it("retains separately labeled practice from both recorded instructors", () => {
    const html = renderToStaticMarkup(<RecordedPracticeHistory history={[
      {
        id: "practice-a",
        courseUnitId: "unit-1",
        courseUnitTitle: "Foundations",
        trackVersionId: "track-teacher-a",
        trackTitle: "Teacher A",
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
        policyVersionId: "policy-1",
        scoreNumeric: null,
        recordedAt: new Date("2026-11-13T12:00:00Z"),
      },
    ]}/>);
    expect(html).toContain("2 saved practice attempts");
    expect(html).toContain("Teacher A");
    expect(html).toContain("Teacher B");
    expect(html).toContain("Foundations");
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
