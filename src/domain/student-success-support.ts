import { isStudentVisibleSupportAction } from "@/modules/actions/student-action-policy";
import type { StudentGoalPublicReview } from "@/domain/teacher-student-goal";

/**
 * The authoritative source is getQuickWinActions(), which reads only the
 * signed-in student's OWN Actions inside their current site/program grants.
 *
 * Never derive a student-facing item from teacher-owned academic_intervention
 * records, referrals, counseling notes, safeguarding cases, or staff metadata.
 */
export type OwnedStudentSupportAction = {
  id: string;
  type: string;
  status: string;
  title: string;
  dueAt: string | Date | null;
  resolvedAt?: string | Date | null;
  review?: StudentGoalPublicReview | null;
  subjectType: string;
  subjectId: string;
};

export type StudentSuccessSupportTask = {
  id: string;
  title: string;
  type: string;
  status: "open" | "in_progress" | "waiting" | "resolved";
  dueAt: string | null;
  studentFeedback?: string | null;
  goalOutcome?: StudentGoalPublicReview["outcome"] | null;
  destination: "assignment" | "action";
  destinationId: string;
};

const allowedStatus = ["open", "in_progress", "waiting"] as const;

export function deriveStudentSuccessSupportTasks(
  actions: readonly OwnedStudentSupportAction[],
  limit = 5,
  now = new Date(),
): { tasks: StudentSuccessSupportTask[]; total: number; truncated: boolean } {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25)
    throw new Error("Invalid support-task limit");

  const distinct = new Map<string, StudentSuccessSupportTask>();
  for (const action of actions) {
    const completedGoal = action.type === "student_learning_goal" &&
      action.status === "resolved" && action.review?.outcome === "met" &&
      action.resolvedAt != null &&
      (now.getTime() - new Date(action.resolvedAt).getTime()) >= 0 &&
      (now.getTime() - new Date(action.resolvedAt).getTime()) <= 30 * 24 * 60 * 60_000;
    if (!isStudentVisibleSupportAction(action.type) ||
        (!allowedStatus.some(status => status === action.status) && !completedGoal) ||
        !action.id || distinct.has(action.id)) continue;
    const isAssignment = action.subjectType === "assessment" && Boolean(action.subjectId);
    const date = action.dueAt ? new Date(action.dueAt) : null;
    distinct.set(action.id, {
      id: action.id,
      // Title is from an already student-owned support Action.
      // Never include staff-only Action description or metadata.
      title: action.title,
      type: action.type,
      status: action.status as StudentSuccessSupportTask["status"],
      dueAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
      studentFeedback: action.type === "student_learning_goal"
        ? action.review?.studentFeedback ?? null : null,
      goalOutcome: action.type === "student_learning_goal"
        ? action.review?.outcome ?? null : null,
      destination: isAssignment ? "assignment" : "action",
      destinationId: isAssignment ? action.subjectId : action.id,
    });
  }
  const all = [...distinct.values()].sort((a, b) => {
    // Completed goals are celebrations, but never crowd out unfinished tasks.
    if (a.status === "resolved" && b.status !== "resolved") return 1;
    if (b.status === "resolved" && a.status !== "resolved") return -1;
    const aDue = a.dueAt === null ? Infinity : Date.parse(a.dueAt);
    const bDue = b.dueAt === null ? Infinity : Date.parse(b.dueAt);
    return aDue - bDue || a.id.localeCompare(b.id);
  });
  return { tasks: all.slice(0, limit), total: all.length, truncated: all.length > limit };
}

export type StudentSuccessSupportSummary = ReturnType<typeof deriveStudentSuccessSupportTasks>;
