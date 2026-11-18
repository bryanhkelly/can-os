import { describe, expect, it } from "vitest";
import {
  canSubmitAssignmentWork,
  shouldAutosaveAssignmentDraft,
  assignmentSummaryForSection,
} from "@/domain/student-assignment-work";

describe("student assignment work state", () => {
  it("accepts an answer with enough text or a queued attachment", () => {
    expect(canSubmitAssignmentWork({ responseText: "  Yes  ", queuedFiles: 0, verifiedFiles: 0 })).toBe(true);
    expect(canSubmitAssignmentWork({ responseText: "", queuedFiles: 1, verifiedFiles: 0 })).toBe(true);
    expect(canSubmitAssignmentWork({ responseText: "  ", queuedFiles: 0, verifiedFiles: 0 })).toBe(false);
    expect(canSubmitAssignmentWork({ responseText: "ok", queuedFiles: 0, verifiedFiles: 0 })).toBe(false);
  });

  it("accepts a verified file-only attempt even if the initial page state was unassigned or returned", () => {
    // The server enforces attempt scope and ownership when it verifies files.
    expect(canSubmitAssignmentWork({ responseText: "", queuedFiles: 0, verifiedFiles: 1 })).toBe(true);
  });

  it("autosaves a changed draft when the learner reverts to the initially loaded text", () => {
    expect(shouldAutosaveAssignmentDraft({
      hydrated: true, editable: true, busy: false,
      draft: "initial text", lastSaved: "edited text",
    })).toBe(true);
    expect(shouldAutosaveAssignmentDraft({
      hydrated: true, editable: true, busy: false,
      draft: "initial text", lastSaved: "initial text",
    })).toBe(false);
  });

  it("counts only assignments from the selected class without losing cross-class totals", () => {
    const work = [
      { sectionId: "english", status: "submitted", title: "Essay" },
      { sectionId: "english", status: "graded", title: "Journal" },
      { sectionId: "math", status: "assigned", title: "Worksheet" },
    ];
    expect(assignmentSummaryForSection(work, "english")).toMatchObject({total: 2, awaitingFeedback: 1, graded: 1});
    expect(assignmentSummaryForSection(work)).toMatchObject({total: 3, awaitingFeedback: 1, graded: 1});
    expect(assignmentSummaryForSection(work, "science")).toMatchObject({total: 0, awaitingFeedback: 0, graded: 0});
  });

  it("does not autosave while busy, unauthenticated in the browser, or read-only", () => {
    for (const overrides of [
      { busy: true }, { hydrated: false }, { editable: false },
    ]) expect(shouldAutosaveAssignmentDraft({
      hydrated: true, editable: true, busy: false,
      draft: "new", lastSaved: "old", ...overrides,
    })).toBe(false);
  });
});
