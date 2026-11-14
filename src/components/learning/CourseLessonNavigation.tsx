import type { ReactNode } from "react";

export type CourseLessonNeighbor = { id: string; title: string };

/** Navigation is independent of routes, enrollment type and presenter choice. */
export function CourseLessonNavigation({
  lessonIndex, lessonCount, completedCount, progressLabel, previousLesson, nextLesson,
  renderPrevious, renderNext,
}: {
  lessonIndex: number; lessonCount: number; completedCount?: number;
  progressLabel?: string;
  previousLesson?: CourseLessonNeighbor | null; nextLesson?: CourseLessonNeighbor | null;
  renderPrevious: (lesson: CourseLessonNeighbor) => ReactNode;
  renderNext: (lesson: CourseLessonNeighbor) => ReactNode;
}) {
  return <nav aria-label="Course lesson navigation" className="mb-5 space-y-3 rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>Lesson {lessonIndex+1} of {lessonCount}</span>
      {completedCount !== undefined && <span>{completedCount} of {lessonCount} {progressLabel ?? "lessons complete"}</span>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      {previousLesson ? renderPrevious(previousLesson) :
        <span className="text-muted-foreground">Beginning of course</span>}
      {nextLesson ? renderNext(nextLesson) :
        <span className="text-muted-foreground">End of published course</span>}
    </div>
    <p className="text-xs text-muted-foreground">
      Navigation never marks lessons complete or awards grades or academic credit.
    </p>
  </nav>;
}
