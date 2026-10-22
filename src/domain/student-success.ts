/**
 * Student success starts with actionable evidence, not speculative risk scores.
 * This helper never interprets missing telemetry as poor engagement, or
 * student-reported lesson completion as mastery or earned credit.
 */
export function deriveClassNextSteps(input: {
  lessonIds: readonly string[];
  completedLessonIds: readonly string[];
  assessments: readonly { status: string; score?: number | null }[];
}) {
  const finished = new Set(input.completedLessonIds);
  const nextLessonId = input.lessonIds.find(id => !finished.has(id)) ?? null;
  const awaitingFeedback = input.assessments.filter(item => item.status === "submitted").length;
  const revisionRequested = input.assessments.filter(item => item.status === "returned").length;
  return {
    nextLessonId,
    selfReportedCompleted: input.lessonIds.filter(id => finished.has(id)).length,
    totalPublishedLessons: input.lessonIds.length,
    awaitingFeedback,
    revisionRequested,
    message: nextLessonId
      ? "A published lesson remains available for you to work on."
      : "No additional published lessons are currently awaiting a self-reported completion. This is not a mastery or credit decision.",
  };
}
