import { Link } from "@tanstack/react-router";
import { WorkspacePanel } from "@/components/workspace";

export function ClassLearningProgress({
  search, isTeacher, lessonCount, completedCount, studentCount,
}: {
  search: { section: string; student?: string };
  isTeacher: boolean;
  lessonCount: number;
  completedCount: number;
  studentCount: number;
}) {
  return <WorkspacePanel title="Learning progress"
    description="Student-reported lesson completion is not a grade, mastery score or attendance record.">
    <p className="text-sm">
      {isTeacher ? `${lessonCount} published lessons · ${studentCount} enrolled students`
        : `${completedCount} / ${lessonCount} published lessons marked complete`}
    </p>
    <Link to="/classes" search={{...search,tab:"lessons"}}
      className="mt-3 inline-block text-sm underline">Open lessons</Link>
  </WorkspacePanel>;
}
