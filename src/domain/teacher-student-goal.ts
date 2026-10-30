import { z } from "zod";

/**
 * An independently authored, student-appropriate academic goal. Never copy
 * private teacher observations, counseling notes, event metadata, or an
 * intervention's description into the student's Action.
 */
export const teacherStudentGoalInput = z.object({
  teacherActionId: z.string().uuid(),
  title: z.string().trim().min(8).max(120),
  studentInstructions: z.string().trim().min(15).max(750),
  dueInDays: z.union([z.literal(3), z.literal(7), z.literal(14)]),
  confirmedStudentSafe: z.literal(true),
}).strict();

export type TeacherStudentGoalInput = z.infer<typeof teacherStudentGoalInput>;

export const STUDENT_LEARNING_GOAL_TYPE = "student_learning_goal" as const;

export function studentLearningGoalActionText(input: TeacherStudentGoalInput) {
  const validated = teacherStudentGoalInput.parse(input);
  return { title: validated.title, description: validated.studentInstructions };
}

/**
 * A teacher assesses actual graded student work and publishes an explicitly
 * student-safe next step. A score is evidence; a goal outcome is still a
 * human judgment and does not alter grades, credits, attendance or mastery.
 */
export const studentGoalReviewInput = z.object({
  goalActionId: z.string().uuid(),
  gradedSubmissionId: z.string().uuid(),
  outcome: z.enum(["met", "needs_more_practice"]),
  studentFeedback: z.string().trim().min(15).max(700),
  confirmedStudentSafe: z.literal(true),
}).strict();

export type StudentGoalReviewInput = z.infer<typeof studentGoalReviewInput>;
export const studentGoalOutcomeLabels: Record<StudentGoalReviewInput["outcome"], string> = {
  met: "Learning goal met — teacher reviewed",
  needs_more_practice: "Keep practicing — teacher reviewed",
};

export type StudentGoalPublicReview = {
  outcome: StudentGoalReviewInput["outcome"];
  studentFeedback: string;
  reviewedAt: string;
};
export function isStudentGoalPublicReview(value: unknown): value is StudentGoalPublicReview {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (row.outcome === "met" || row.outcome === "needs_more_practice") &&
    typeof row.studentFeedback === "string" &&
    row.studentFeedback.trim().length >= 15 && row.studentFeedback.length <= 700 &&
    typeof row.reviewedAt === "string" &&
    Number.isFinite(Date.parse(row.reviewedAt));
}

export function statusFromTeacherGoalReview(
  outcome: StudentGoalReviewInput["outcome"],
): "resolved" | "in_progress" {
  return outcome === "met" ? "resolved" : "in_progress";
}
