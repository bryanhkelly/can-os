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
