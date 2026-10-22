import { isStudentVisibleSupportAction } from "@/modules/actions/student-action-policy";

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
  subjectType: string;
  subjectId: string;
};

export type StudentSuccessSupportTask = {
  id: string;
  title: string;
  type: string;
  status: "open" | "in_progress" | "waiting";
  dueAt: string | null;
  destination: "assignment" | "action";
  destinationId: string;
};

const allowedStatus = ["open", "in_progress", "waiting"] as const;

export function deriveStudentSuccessSupportTasks(
  actions: readonly OwnedStudentSupportAction[],
  limit = 5,
): { tasks: StudentSuccessSupportTask[]; total: number; truncated: boolean } {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25)
    throw new Error("Invalid support-task limit");

  const distinct = new Map<string, StudentSuccessSupportTask>();
  for (const action of actions) {
    if (!isStudentVisibleSupportAction(action.type) ||
        !allowedStatus.some(status => status === action.status) ||
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
      destination: isAssignment ? "assignment" : "action",
      destinationId: isAssignment ? action.subjectId : action.id,
    });
  }
  const all = [...distinct.values()].sort((a, b) => {
    const aDue = a.dueAt === null ? Infinity : Date.parse(a.dueAt);
    const bDue = b.dueAt === null ? Infinity : Date.parse(b.dueAt);
    return aDue - bDue || a.id.localeCompare(b.id);
  });
  return { tasks: all.slice(0, limit), total: all.length, truncated: all.length > limit };
}

export type StudentSuccessSupportSummary = ReturnType<typeof deriveStudentSuccessSupportTasks>;
