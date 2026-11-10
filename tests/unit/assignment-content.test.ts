import { describe, expect, it } from "vitest";
import {
  readAssignmentContent,
  parseAssignmentContentDraft,
  ASSIGNMENT_CONTENT_LIMITS,
} from "@/domain/assignment-content";

describe("readAssignmentContent", () => {
  it("returns null for absent, malformed or empty metadata", () => {
    expect(readAssignmentContent(undefined)).toBeNull();
    expect(readAssignmentContent(null)).toBeNull();
    expect(readAssignmentContent("essay")).toBeNull();
    expect(readAssignmentContent([])).toBeNull();
    expect(readAssignmentContent({})).toBeNull();
    expect(readAssignmentContent({ description: "   ", objectives: [], steps: [{}] })).toBeNull();
  });

  it("reads a fully structured assignment", () => {
    const content = readAssignmentContent({
      description: "Build an evidence-based argument.",
      overview: ["Paragraph one.", "Paragraph two."],
      prompt: "Fate or choice?",
      objectives: ["Develop a thesis.", "Use textual evidence."],
      steps: [{ title: "Review the play.", detail: "Revisit three scenes." }, { title: "Write.", detail: "" }],
      formatNote: "MLA heading, double spacing.",
    });
    expect(content).toEqual({
      description: "Build an evidence-based argument.",
      overview: ["Paragraph one.", "Paragraph two."],
      prompt: "Fate or choice?",
      objectives: ["Develop a thesis.", "Use textual evidence."],
      steps: [{ title: "Review the play.", detail: "Revisit three scenes." }, { title: "Write.", detail: "" }],
      formatNote: "MLA heading, double spacing.",
    });
  });

  it("drops malformed entries, oversized text and excess items instead of throwing", () => {
    const content = readAssignmentContent({
      description: "x".repeat(ASSIGNMENT_CONTENT_LIMITS.text + 1),
      overview: [42, "Kept.", null],
      objectives: Array.from({ length: 20 }, (_, i) => `Objective ${i}`),
      steps: [{ detail: "no title" }, { title: "Kept step." }, "not an object"],
    });
    expect(content).not.toBeNull();
    expect(content!.description).toBeNull();
    expect(content!.overview).toEqual(["Kept."]);
    expect(content!.objectives).toHaveLength(ASSIGNMENT_CONTENT_LIMITS.listItems);
    expect(content!.steps).toEqual([{ title: "Kept step.", detail: "" }]);
  });
});

describe("parseAssignmentContentDraft", () => {
  const empty = { description: "", overview: "", prompt: "", objectives: "", steps: "", formatNote: "" };

  it("returns null when every field is blank", () => {
    expect(parseAssignmentContentDraft(empty)).toBeNull();
    expect(parseAssignmentContentDraft({ ...empty, description: "   " })).toBeNull();
  });

  it("splits overview on blank lines, lists per line and steps on the pipe", () => {
    const payload = parseAssignmentContentDraft({
      description: " Short description ",
      overview: "First paragraph\ncontinues here.\n\nSecond paragraph.",
      prompt: "Fate or choice?",
      objectives: "One\n\nTwo\n",
      steps: "Review the play. | Revisit three scenes.\nWrite your essay.\n| no title",
      formatNote: "MLA format.",
    });
    expect(payload).toEqual({
      description: "Short description",
      overview: ["First paragraph continues here.", "Second paragraph."],
      prompt: "Fate or choice?",
      objectives: ["One", "Two"],
      steps: [
        { title: "Review the play.", detail: "Revisit three scenes." },
        { title: "Write your essay.", detail: "" },
      ],
      formatNote: "MLA format.",
    });
  });

  it("round-trips through the metadata reader", () => {
    const payload = parseAssignmentContentDraft({
      ...empty, prompt: "Who is responsible?", objectives: "Analyze theme",
    });
    expect(readAssignmentContent(payload)).toMatchObject({
      prompt: "Who is responsible?",
      objectives: ["Analyze theme"],
    });
  });
});
