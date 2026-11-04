import { createFileRoute } from "@tanstack/react-router";
import { StudentExperience } from "@/components/student/StudentExperience";
import { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { getAssignments } from "@/modules/student-experience/assignments.functions";
import { getQuickWinActions } from "@/modules/actions/student-actions.functions";
import { getStudentReportCard } from "@/modules/learning/report-cards.functions";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { getClassWorkspace } from "@/modules/learning/class-workspace.functions";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";
import { DataUnavailableError, safeLoader } from "@/lib/safe-loader";
import type { StudentDashboardData } from "@/components/student/student-dashboard-data";
import {
  deriveStudentSuccessSupportTasks,
  type StudentSuccessSupportSummary,
} from "@/domain/student-success-support";
import {
  deriveClassNextSteps, deriveStudentSuccessPriorities, type StudentSuccessPriorities,
} from "@/domain/student-success";
import { LoaderFailure } from "@/lib/loader-failure";

/**
 * Read both views from the current authenticated student. The canonical
 * assignment reader includes published work even before a submission exists,
 * unlike the Student Today legacy submission-only coursework snapshot.
 */
export async function loadStudentToday() {
  const today = await getMyStudentToday();
  const [assignmentResult, supportResult, grades, community] = await Promise.all([
    safeLoader(async () => {
      const view = await getAssignments();
      if (!view.connected) throw new DataUnavailableError();
      return view.assignments.map(item => ({
        assessmentId: item.assessmentId, sectionId: item.sectionId,
        title: item.title, course: item.course, dueAt: item.dueAt,
        status: item.status, timeliness: item.timeliness,
        assessmentStatus: item.assessmentStatus, canEdit: item.canEdit,
        hasDraft: Boolean(item.responseText?.trim()),
      }));
    })(),
    safeLoader(async () => {
      const view = await getQuickWinActions();
      if (!view.connected) throw new DataUnavailableError();
      return deriveStudentSuccessSupportTasks(view.actions);
    })(),
    safeLoader(async () => (await getStudentReportCard({ data: {} })).grades.map(grade => ({
      sectionGradeId: grade.sectionGradeId, sectionTitle: grade.sectionTitle,
      schoolYearName: grade.schoolYearName, gradingPeriodName: grade.gradingPeriodName,
      letterGrade: grade.letterGrade, percentage: grade.percentage,
    })))(),
    safeLoader(async () => {
      const view = await getSchoolExperiences();
      if (!view.connected) throw new DataUnavailableError();
      return { connected: view.connected, events: view.events, notices: view.notices };
    })(),
  ]);
  let success: StudentSuccessPriorities | null = null;
  if (assignmentResult.ok) success = deriveStudentSuccessPriorities(assignmentResult.data, new Date(today.generatedAt));
  const support: StudentSuccessSupportSummary | null = supportResult.ok ? supportResult.data : null;
  const nextSection = success?.steps.find(step => step.canEdit && step.sectionId)?.sectionId;
  const sectionId = today.sections.find(section => section.sectionId === nextSection)?.sectionId
    ?? today.sections[0]?.sectionId;
  const learning = await safeLoader(async () => {
    if (!sectionId) return null;
    const workspace = await getClassWorkspace({ data: { sectionId } });
    if (!workspace.curriculumAccess.available || !workspace.content) throw new DataUnavailableError();
    const lessons = workspace.content.modules.flatMap(module => module.lessons).filter(isLearnerFacingInstruction);
    const steps = deriveClassNextSteps({
      lessonIds: lessons.map(lesson => lesson.id),
      completedLessonIds: workspace.progress.filter(item => item.completedAt !== null).map(item => item.lessonId),
      assessments: [],
    });
    const lesson = lessons.find(item => item.id === steps.nextLessonId);
    return {
      sectionId, title: workspace.section.title,
      lesson: lesson ? { id: lesson.id, title: lesson.title, estimatedMinutes: lesson.estimatedMinutes } : null,
      completed: steps.selfReportedCompleted, total: steps.totalPublishedLessons,
    };
  })();
  const dashboard: StudentDashboardData = { assignments: assignmentResult, learning, grades, community };
  return { today, success, support, dashboard };
}

export const Route = createFileRoute("/student/")({
  loader: safeLoader(loadStudentToday, {
    authMessage: "Sign in with an enrolled student account to see your learning day.",
  }),
  component: StudentTodayPage,
});
function StudentTodayPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <LoaderFailure eyebrow="CAN OS · Student" title="Your learning day" outcome={result} />;
  return <StudentExperience liveData={result.data.today} success={result.data.success}
    support={result.data.support} dashboard={result.data.dashboard} />;
}
