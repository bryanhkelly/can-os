import { Link } from "@tanstack/react-router";
import { WorkspacePanel } from "@/components/workspace";

export interface StudentNextSteps {
  nextLessonId?: string | null;
  message: string;
  selfReportedCompleted: number;
  totalPublishedLessons: number;
  awaitingFeedback: number;
  revisionRequested: number;
}

export function StudentNextStepsPanel({
  nextSteps,
  search,
}: {
  nextSteps: StudentNextSteps;
  search: { section?: string; student?: string; tab?: "overview" | "lessons" | "planning" | "files" | "syllabus" | "announcements" | "people" | "teacher-guide"; lesson?: string };
}) {
  return (
    <WorkspacePanel
      title="Your next learning steps"
      description="Recommendations come from published lessons and actual assessment status; they do not assign a grade or claim mastery."
    >
      {nextSteps.nextLessonId ? (
        <Link
          to="/classes"
          search={{ ...search, tab: "lessons", lesson: nextSteps.nextLessonId }}
          className="text-sm underline"
        >
          Continue the next uncompleted lesson →
        </Link>
      ) : (
        <p className="text-sm">{nextSteps.message}</p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        {nextSteps.selfReportedCompleted} of {nextSteps.totalPublishedLessons} published lessons marked complete
        {" · "}{nextSteps.awaitingFeedback} assessment(s) awaiting feedback
        {" · "}{nextSteps.revisionRequested} returned for revision
      </p>
      <p className="mt-2 text-xs">
        If you need help, use your school's academic-support or teacher communication workflow.
      </p>
    </WorkspacePanel>
  );
}
