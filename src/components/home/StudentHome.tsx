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
        assessmentStatus: item.assessmentStatus, canEdit: item.canEdit, timezone: item.timezone,
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
  // Prefer the class with urgent work, but never let an empty or unavailable
  // classroom prevent the student from resuming a different published lesson.
  const preferredSectionId = success?.steps.find(step => step.canEdit && step.sectionId)?.sectionId;
  const candidates = [...today.sections].sort((a, b) =>
    Number(b.sectionId === preferredSectionId) - Number(a.sectionId === preferredSectionId));
  const learning = await safeLoader(async () => {
    let completedFallback: {
      sectionId: string; title: string;
      lesson: { id: string; title: string; estimatedMinutes?: number } | null;
      completed: number; total: number;
    } | null = null;
    for (const section of candidates) {
      // A single unpublished or temporarily unavailable class must not block
      // every other enrolled class. The canonical class reader checks access.
      const result = await safeLoader(() => getClassWorkspace({ data: { sectionId: section.sectionId } }))();
      if (!result.ok || !result.data.curriculumAccess.available || !result.data.content) continue;
      const workspace = result.data;
      const lessons = workspace.content.modules.flatMap(module => module.lessons).filter(isLearnerFacingInstruction);
      if (!lessons.length) continue;
      const steps = deriveClassNextSteps({
        lessonIds: lessons.map(lesson => lesson.id),
        completedLessonIds: workspace.progress.filter(item => item.completedAt !== null).map(item => item.lessonId),
        assessments: [],
      });
      const nextLesson = lessons.find(item => item.id === steps.nextLessonId);
      const projected = {
        sectionId: section.sectionId,
        title: workspace.section.title,
        lesson: nextLesson ? { id: nextLesson.id, title: nextLesson.title, estimatedMinutes: nextLesson.estimatedMinutes } : null,
        completed: steps.selfReportedCompleted,
        total: steps.totalPublishedLessons,
      };
      if (nextLesson) return projected;
      completedFallback ??= projected;
    }
    if (!completedFallback && candidates.length) throw new DataUnavailableError();
    return completedFallback;
  })();
  const dashboard: StudentDashboardData = { assignments: assignmentResult, learning, grades, community };
  return { today, success, support, dashboard };
}

export const loadStudentHome = safeLoader(loadStudentToday, {
  authMessage: "Sign in with an enrolled student account to see your learning day.",
});

export function StudentHome({ result }: { result: Awaited<ReturnType<typeof loadStudentHome>> }) {
  if (!result.ok) return <LoaderFailure eyebrow="Student" title="Your learning day" outcome={result} />;
  return <StudentExperience liveData={result.data.today} success={result.data.success}
    support={result.data.support} dashboard={result.data.dashboard} />;
}
