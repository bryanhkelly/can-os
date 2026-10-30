/**
 * Student success starts with actionable evidence, not speculative risk scores.
 * This helper never interprets missing telemetry as poor engagement, or
 * student-reported lesson completion as mastery or earned credit.
 */
export function deriveClassNextSteps(input: {
  lessonIds: readonly string[];
  completedLessonIds: readonly string[];
  assessments: readonly { status: string; score?: number | null }[];
}) {
  const finished = new Set(input.completedLessonIds);
  const nextLessonId = input.lessonIds.find(id => !finished.has(id)) ?? null;
  const awaitingFeedback = input.assessments.filter(item => item.status === "submitted").length;
  const revisionRequested = input.assessments.filter(item => item.status === "returned").length;
  return {
    nextLessonId,
    selfReportedCompleted: input.lessonIds.filter(id => finished.has(id)).length,
    totalPublishedLessons: input.lessonIds.length,
    awaitingFeedback,
    revisionRequested,
    message: nextLessonId
      ? "A published lesson remains available for you to work on."
      : "No additional published lessons are currently awaiting a self-reported completion. This is not a mastery or credit decision.",
  };
}


/**
 * Student Today must include published assignments with NO submission row yet.
 * The caller supplies ONLY the signed-in student's enrolled-section assignments
 * from the canonical getAssignments() service. This is a view/projection, not a
 * new grade, mastery, attendance, safety or counseling decision.
 */
export type StudentSuccessAssignment = {
  assessmentId: string;
  sectionId: string | null;
  title: string;
  course: string;
  dueAt: string | null;
  status: string | null;
  timeliness: string | null;
  assessmentStatus: string;
  /** Derived by the canonical assignment reader, never an authorization grant. */
  canEdit: boolean;
};

export type StudentSuccessStepKind =
  | "revision" | "overdue" | "due_soon" | "to_do" | "awaiting_feedback" | "review_feedback";

export type StudentSuccessStep = StudentSuccessAssignment & {
  kind: StudentSuccessStepKind;
  label: string;
};

const STEP_LABELS: Record<StudentSuccessStepKind, string> = {
  revision: "Revise and resubmit",
  overdue: "Overdue · work to submit",
  due_soon: "Due within seven days",
  to_do: "Ready to work on",
  awaiting_feedback: "Submitted · awaiting teacher feedback",
  review_feedback: "Teacher feedback available",
};
const STEP_PRIORITY: Record<StudentSuccessStepKind, number> = {
  revision: 0, overdue: 1, due_soon: 2, to_do: 3,
  review_feedback: 4, awaiting_feedback: 5,
};
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function classifyStudentAssignment(
  item: StudentSuccessAssignment, nowMs: number,
): StudentSuccessStepKind | null {
  const status = item.status;
  const published = item.assessmentStatus === "published";
  // A draft/closed assessment must not generate a submit-work CTA. Completed
  // assignments can still offer a safe view of actual grading/feedback.
  if (published && item.canEdit && status === "returned") return "revision";
  if ((published || item.assessmentStatus==="closed") &&
      (status === "graded" || status === "returned")) return "review_feedback";
  if (status === "submitted") return "awaiting_feedback";
  if (!published || !item.canEdit || (status !== "assigned" && status !== null)) return null;
  const due = item.dueAt === null ? null : Date.parse(item.dueAt);
  const validDue = due !== null && Number.isFinite(due) ? due : null;
  if (item.timeliness === "missing" || (validDue !== null && validDue < nowMs))
    return "overdue";
  if (validDue !== null && validDue <= nowMs + WEEK_MS) return "due_soon";
  return "to_do";
}

export function deriveStudentSuccessPriorities(
  assignments: readonly StudentSuccessAssignment[],
  now: Date,
  limit = 6,
) {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !Number.isSafeInteger(limit) || limit < 1 || limit > 25)
    throw new Error("Invalid Student Success review window");
  // The canonical reader returns only the latest submission attempt per
  // assessment; defend against accidental duplicate projections as well.
  const unique = new Map<string, StudentSuccessStep>();
  for (const item of assignments) {
    if (!item.assessmentId || unique.has(item.assessmentId)) continue;
    const kind = classifyStudentAssignment(item, nowMs);
    if (kind === null) continue;
    unique.set(item.assessmentId, {...item, kind, label: STEP_LABELS[kind]});
  }
  const steps = [...unique.values()].sort((a,b) => {
    const rank = STEP_PRIORITY[a.kind] - STEP_PRIORITY[b.kind];
    if (rank !== 0) return rank;
    const aDue = a.dueAt ? Date.parse(a.dueAt) : NaN;
    const bDue = b.dueAt ? Date.parse(b.dueAt) : NaN;
    const dueOrder = (Number.isFinite(aDue) ? aDue : Number.POSITIVE_INFINITY) -
      (Number.isFinite(bDue) ? bDue : Number.POSITIVE_INFINITY);
    return (Number.isNaN(dueOrder) ? 0 : dueOrder) || a.assessmentId.localeCompare(b.assessmentId);
  });
  const count = (kind: StudentSuccessStepKind) => steps.filter(x=>x.kind===kind).length;
  return {
    steps: steps.slice(0, limit),
    total: steps.length,
    requiresAction: count("revision") + count("overdue") + count("due_soon") + count("to_do"),
    revise: count("revision"),
    overdue: count("overdue"),
    dueSoon: count("due_soon"),
    toDo: count("to_do"),
    awaitingFeedback: count("awaiting_feedback"),
    feedbackAvailable: count("review_feedback"),
    truncated: steps.length > limit,
    notice: "Based on current assignments in your enrolled classes. Teacher feedback and your school's grading rules determine achievement; this is not a risk score or a credit decision.",
  };
}

export type StudentSuccessPriorities = ReturnType<typeof deriveStudentSuccessPriorities>;
