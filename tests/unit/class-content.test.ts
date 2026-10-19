import { describe, expect, it } from "vitest";
import { classContentSchema, classResources, readClassContent, validateAnnotationRange } from "@/domain/class-content";

const learning = { version: 1, syllabus: "Course goals", modules: [
  { id: "reading", title: "Reading", lessons: [{ id: "evidence", title: "Evidence", body: "Read carefully.",
    resources: [{ id: "library", title: "Library", url: "https://www.loc.gov/" }] }] },
], resources: [{ id: "syllabus-pdf", title: "Syllabus PDF", documentId: "30000000-0000-4000-8000-000000000001" }] };
describe("published class content contract", () => {
  it("distinguishes unconfigured content from malformed published content", () => {
    expect(readClassContent({})).toBeNull();
    expect(() => readClassContent({ learning: { version: 99 } })).toThrow(/Published class content is invalid/);
  });
  it("reads lessons, syllabus and referenced files from the immutable version", () => {
    const content = readClassContent({ learning });
    expect(content?.modules[0]?.lessons[0]?.body).toBe("Read carefully.");
    expect(content && classResources(content).map(item => item.id)).toEqual(["syllabus-pdf", "library"]);
  });
  it.each(["javascript:alert(1)", "data:text/html,hello", "http://example.com/", "https://user:password@example.com/"])(
    "rejects unsafe external resource URLs (%s)", url => {
      expect(classContentSchema.safeParse({ version: 1, resources: [{ id: "x", title: "Unsafe", url }] }).success).toBe(false);
    },
  );
  it("requires exactly one external URL or private document per resource", () => {
    expect(classContentSchema.safeParse({ version: 1, resources: [{ id: "x", title: "Missing" }] }).success).toBe(false);
    expect(classContentSchema.safeParse({ version: 1, resources: [{ ...learning.resources[0], url: "https://example.com" }] }).success).toBe(false);
  });
  it("rejects duplicate module, lesson or resource IDs instead of marking the wrong work complete", () => {
    const module = learning.modules[0]!;
    expect(classContentSchema.safeParse({ ...learning, modules: [module, module] }).success).toBe(false);
    expect(classContentSchema.safeParse({ ...learning, modules: [module, { ...module, id: "other" }] }).success).toBe(false);
    expect(classContentSchema.safeParse({ ...learning, resources: [learning.resources[0], learning.resources[0]] }).success).toBe(false);
  });
  it("keeps plain text content as text, never trusted HTML", () => {
    expect(readClassContent({ learning: { version: 1, syllabus: "<script>alert(1)</script>" } })?.syllabus).toContain("<script>");
  });
});
describe("attempt-specific text annotations", () => {
  it("accepts only the exact selected passage and UTF-16 browser offsets", () => {
    expect(() => validateAnnotationRange("An example essay.", 3, 10, "example")).not.toThrow();
    expect(() => validateAnnotationRange("A 🌍 view", 2, 4, "🌍")).not.toThrow();
  });
  it.each([
    [-1, 3, "An"], [3, 3, ""], [3, 99, "example"], [3, 10, "altered"], [3.2, 10, "example"],
  ] as const)("rejects stale, fabricated and out-of-bounds ranges (%s,%s,%s)", (start, end, quote) => {
    expect(() => validateAnnotationRange("An example essay.", start, end, quote)).toThrow(/must match/);
  });
});
