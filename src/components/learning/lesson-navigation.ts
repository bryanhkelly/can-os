import { FIRST_PUBLISHED_LESSON_ROUTE } from "@/domain/first-class-lesson";

/** Navigation over the caller's already-filtered, learner-facing published lessons. */
export function selectPublishedLesson<T extends { id: string }>(
  lessons: readonly T[],
  requestedId?: string,
) {
  const lesson = requestedId === FIRST_PUBLISHED_LESSON_ROUTE
    ? lessons[0]
    : lessons.find((item) => item.id === requestedId);
  const index = lesson ? lessons.findIndex((item) => item.id === lesson.id) : -1;
  return {
    lesson,
    lessonIndex: index,
    previousLesson: index > 0 ? lessons[index - 1] : null,
    nextLesson: index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null,
  };
}
