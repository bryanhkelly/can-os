import { describe, expect, it } from "vitest";
import { FIRST_PUBLISHED_LESSON_ROUTE } from "@/domain/first-class-lesson";
import { selectPublishedLesson } from "./lesson-navigation";

describe("published lesson navigation", () => {
  const lessons = [{ id: "intro" }, { id: "practice" }, { id: "review" }];

  it("resolves the first published lesson shortcut", () => {
    const result = selectPublishedLesson(lessons, FIRST_PUBLISHED_LESSON_ROUTE);
    expect(result.lesson?.id).toBe("intro");
    expect(result.lessonIndex).toBe(0);
    expect(result.previousLesson).toBeNull();
    expect(result.nextLesson?.id).toBe("practice");
  });

  it("navigates between published lessons without modifying them", () => {
    const result = selectPublishedLesson(lessons, "practice");
    expect(result.lessonIndex).toBe(1);
    expect(result.previousLesson?.id).toBe("intro");
    expect(result.nextLesson?.id).toBe("review");
    expect(lessons).toHaveLength(3);
  });

  it("handles empty published lesson sequences", () => {
    expect(selectPublishedLesson([], FIRST_PUBLISHED_LESSON_ROUTE)).toEqual({ lesson: undefined, lessonIndex: -1, previousLesson: null, nextLesson: null });
  });

  it("does not infer an unauthorized or unpublished lesson", () => {
    expect(selectPublishedLesson(lessons, "missing")).toEqual({
      lesson: undefined,
      lessonIndex: -1,
      previousLesson: null,
      nextLesson: null,
    });
  });
});
