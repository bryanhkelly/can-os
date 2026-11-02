import { createFileRoute } from "@tanstack/react-router";
import { StudentExperience } from "@/components/student/StudentExperience";
import { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { getAssignments } from "@/modules/student-experience/assignments.functions";
import { getQuickWinActions } from "@/modules/actions/student-actions.functions";
import {
  deriveStudentSuccessSupportTasks,
  type StudentSuccessSupportSummary,
} from "@/domain/student-success-support";
import {
  deriveStudentSuccessPriorities, type StudentSuccessPriorities,
} from "@/domain/student-success";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

/**
 * Read both views from the current authenticated student. The canonical
 * assignment reader includes published work even before a submission exists,
 * unlike the Student Today legacy submission-only coursework snapshot.
 */
async function loadStudentToday() {
  const today = await getMyStudentToday();
  let success: StudentSuccessPriorities | null = null;
  try {
    const assignmentView = await getAssignments();
    if (assignmentView.connected) {
      success = deriveStudentSuccessPriorities(assignmentView.assignments.map(item => ({
        assessmentId: item.assessmentId,
        sectionId: item.sectionId,
        title: item.title,
        course: item.course,
        dueAt: item.dueAt,
        status: item.status,
        timeliness: item.timeliness,
        assessmentStatus: item.assessmentStatus,
        canEdit:item.canEdit,
      })), new Date());
    }
  } catch {
    // Do not turn a recoverable assignments outage into a broken school-day
    // screen, or represent unavailable records as "no work assigned".
  }
  let support: StudentSuccessSupportSummary | null = null;
  try {
    const ownedActions = await getQuickWinActions();
    if (ownedActions.connected) {
      support = deriveStudentSuccessSupportTasks(ownedActions.actions);
    }
  } catch {
    // Degrade independently: an Action read failure cannot break classes and
    // coursework, or be mistaken for an empty support caseload.
  }
  return { today, success, support };
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
  return <StudentExperience liveData={result.data.today} success={result.data.success} support={result.data.support} />;
}
