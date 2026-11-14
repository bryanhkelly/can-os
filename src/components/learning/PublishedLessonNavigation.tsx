import { Link } from "@tanstack/react-router";
import { CourseLessonNavigation } from "./CourseLessonNavigation";

type LessonLink = { id: string; title: string };

export function PublishedLessonNavigation({
  search, lessonIndex, lessonCount, completedCount, isStudent, previousLesson, nextLesson,
}: {
  search: { section: string; student?: string };
  lessonIndex: number;
  lessonCount: number;
  completedCount: number;
  isStudent: boolean;
  previousLesson: LessonLink | null | undefined;
  nextLesson: LessonLink | null | undefined;
}) {
  return <CourseLessonNavigation lessonIndex={lessonIndex} lessonCount={lessonCount}
    completedCount={isStudent?completedCount:undefined}
    progressLabel="lessons self-reported complete"
    previousLesson={previousLesson} nextLesson={nextLesson}
    renderPrevious={lesson=><Link to="/classes"
      search={{...search,tab:"lessons",lesson:lesson.id}} className="underline">
      ← Previous: {lesson.title}
    </Link>}
    renderNext={lesson=><Link to="/classes"
      search={{...search,tab:"lessons",lesson:lesson.id}} className="underline">
      Next: {lesson.title} →
    </Link>}/>;
}
