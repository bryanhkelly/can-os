import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

/**
 * A parser-based safety net for the migrated teacher workflows.
 * These routes remain data/authorization owners; only their controls and
 * presentation must come from the shared V6.1 library.
 */
const sharedControlSurfaces = [
  "src/components/learning/AssessmentDraftEditor.tsx",
  "src/components/learning/AssessmentScheduleEditor.tsx",
  "src/components/learning/GradebookAssessmentComposer.tsx",
  "src/components/learning/GradebookAssessmentHeader.tsx",
  "src/components/learning/GradebookScoringEditor.tsx",
  "src/components/learning/RubricScoreFields.tsx",
  "src/components/learning/GradebookReviewActions.tsx",
  "src/components/learning/GradebookReviewedFeedback.tsx",
  "src/components/learning/GradebookReviewQueue.tsx",
  "src/components/learning/ClassTeacherPlanningPanel.tsx",
  "src/components/teacher/TeacherFirstWeekCard.tsx",
  "src/components/teacher/TeacherDaySchedule.tsx",
  "src/components/teacher/TeacherConferencePanel.tsx",
  "src/components/learning/TeacherLearningFollowUpForm.tsx",
  "src/components/home/TeacherHome.tsx",
  "src/routes/teacher.discussions.tsx",
  "src/routes/teacher.missing-work.tsx",
  "src/routes/groups.tsx",
] as const;

/** Group tabs are native ARIA tab buttons, so they are exempt from the raw-control ban. */
const syntaxOnlySurfaces = ["src/routes/groups_.$groupId.tsx"] as const;

function inspect(path: string) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nativeControls: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      if (["button", "input", "select", "textarea"].includes(tag)) nativeControls.push(tag);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return {
    source,
    nativeControls,
    errors: (file as ts.SourceFile & { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics,
  };
}

describe("teacher V6.1 design adoption", () => {
  it.each([...sharedControlSurfaces, ...syntaxOnlySurfaces])("%s parses as valid TSX", path => {
    expect(inspect(path).errors).toEqual([]);
  });

  it.each(sharedControlSurfaces)("%s uses shared controls and square surfaces", path => {
    const { source, nativeControls } = inspect(path);
    expect(nativeControls).toEqual([]);
    expect(source).not.toMatch(/\brounded(?:-(?:sm|md|lg|xl|2xl|3xl|full))?\b/);
  });

  it("preserves explicit, separate draft and grade-publication actions", () => {
    const composer = inspect("src/components/learning/GradebookAssessmentComposer.tsx").source;
    const review = inspect("src/components/learning/GradebookReviewActions.tsx").source;
    expect(composer).toContain('type="submit" variant="outline"');
    expect(composer).toContain("onSubmit(false)");
    expect(composer).toContain("onSubmit(true)");
    expect(composer).toContain("scheduled release time");
    expect(review).toContain("Save grading draft");
    expect(review).toContain("Post grade");
  });

  it("guards grade and assessment lifecycle changes with the shared confirmation dialog", () => {
    const revised = inspect("src/components/learning/GradebookReviewedFeedback.tsx").source;
    const assessment = inspect("src/components/learning/GradebookAssessmentHeader.tsx").source;
    expect(revised).toContain('confirmLabel="Return for revision"');
    expect(revised).toContain("<ActionDialog");
    expect(assessment).toContain('setPendingAction("publish")');
    expect(assessment).toContain('setPendingAction("close")');
    expect(assessment).toContain("<ActionDialog");
  });
});
