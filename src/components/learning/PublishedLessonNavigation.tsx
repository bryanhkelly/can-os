import { Link } from "@tanstack/react-router";

type LessonLink = { id: string; title: string };

export function PublishedLessonNavigation({
  search,
  lessonIndex,
  lessonCount,
  completedCount,
  isStudent,
  previousLesson,
  nextLesson,
}: {
  search: { section: string; student?: string };
  lessonIndex: number;
  lessonCount: number;
  completedCount: number;
  isStudent: boolean;
  previousLesson: LessonLink | null | undefined;
  nextLesson: LessonLink | null | undefined;
}) {
  return (
    <nav aria-label="Course lesson navigation" className="mb-5 space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Lesson {lessonIndex + 1} of {lessonCount}</span>
        {isStudent && <span>{completedCount} of {lessonCount} lessons self-reported complete</span>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        {previousLesson ? (
          <Link to="/classes" search={{ ...search, tab: "lessons", lesson: previousLesson.id }} className="underline">
            ← Previous: {previousLesson.title}
          </Link>
        ) : (
          <span className="text-muted-foreground">Beginning of course</span>
        )}
        {nextLesson ? (
          <Link to="/classes" search={{ ...search, tab: "lessons", lesson: nextLesson.id }} className="underline">
            Next: {nextLesson.title} →
          </Link>
        ) : (
          <span className="text-muted-foreground">End of published course</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Navigation never marks lessons complete or awards grades or academic credit.
      </p>
    </nav>
  );
}
