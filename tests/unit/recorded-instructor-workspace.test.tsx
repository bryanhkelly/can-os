import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecordedInstructorWorkspace } from "@/components/learning/RecordedInstructorWorkspace";

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
});
