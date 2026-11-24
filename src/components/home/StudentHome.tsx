import { StudentExperience } from "@/components/student/StudentExperience";
import { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { getAssignments } from "@/modules/student-experience/assignments.functions";
import { getQuickWinActions } from "@/modules/actions/student-actions.functions";
import { getStudentReportCard } from "@/modules/learning/report-cards.functions";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { getClassWorkspace } from "@/modules/learning/class-workspace.functions";
import { getNativeClassLearning } from "@/modules/classes/native-class-learning.functions";
import { getMyStudentClasses } from "@/modules/classes/native-class-student-home.functions";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";
import { DataUnavailableError, safeLoader } from "@/lib/safe-loader";
import { orderedBatches } from "@/lib/ordered-batches";
import type { LearningResume, StudentDashboardData } from "@/components/student/student-dashboard-data";
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
  // The native Class index is independent of the older Section lesson resume
  // projection. Begin it early instead of waiting for all Section probes.
  const classesPromise = safeLoader(() => getMyStudentClasses())();
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
  const classes = await classesPromise;
  const learning = await safeLoader(async (): Promise<LearningResume | null> => {
    if (!classes.ok) throw new DataUnavailableError();
    const native = classes.data.classes.filter(item => item.status === "active" && item.enrollmentId && item.courseAttemptId);
    if (native.length) {
      let fallback: LearningResume | null = null;
      // Reuse the authorized native lesson service. Never infer a Class from a Section title.
      for await (const results of orderedBatches(native,3,item =>
        safeLoader(() => getNativeClassLearning({data:{classEnrollmentId:item.enrollmentId!}}))())) {
        for (const result of results) {
          if (!result.ok) continue;
          const view = result.data;
          const lessons = view.lessons.filter(lesson => lesson.lessonBody.trim().length > 0 || lesson.videoResources.length > 0);
          if (!lessons.length) continue;
          const completed = lessons.filter(lesson => lesson.progressStatus === "completed" || lesson.progressStatus === "waived").length;
          const next = lessons.find(lesson => lesson.progressStatus !== "completed" && lesson.progressStatus !== "waived");
          const resume: LearningResume = {classId:view.classId,title:view.classTitle,
            lesson:next ? {id:next.lessonId,title:next.lessonTitle} : null,completed,total:lessons.length};
          if (next) return resume;
          fallback ??= resume;
        }
      }
      if (!fallback) throw new DataUnavailableError();
      return fallback;
    }
    // Section-only schools retain their existing read path until migrated.
    let completedFallback: {
      sectionId: string; title: string;
      lesson: { id: string; title: string; estimatedMinutes?: number } | null;
      completed: number; total: number;
    } | null = null;
    // Bound fan-out to three authorized reads at a time. Preserve ordered
    // selection: the preferred urgent-work Section still wins whenever it has
    // a next lesson, and completed fallbacks still use the earliest candidate.
    for await (const results of orderedBatches(candidates,3,async section => ({
      section,
      result:await safeLoader(() => getClassWorkspace({ data: { sectionId: section.sectionId } }))(),
    }))) {
      for (const {section,result} of results) {
        if (!result.ok || !result.data.curriculumAccess.available) continue;
        const workspace = result.data;
        const content = workspace.content;
        if (!content) continue;
        const lessons = content.modules.flatMap(module => module.lessons).filter(isLearnerFacingInstruction);
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
    }
    if (!completedFallback && candidates.length) throw new DataUnavailableError();
    return completedFallback;
  })();
  const dashboard: StudentDashboardData = { assignments: assignmentResult, learning, grades, community, classes };
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
