import { z } from "zod";

/**
 * A teacher makes the judgment to follow up. Observed activity is only
 * evidence for discussion, never a diagnosis or an automatic risk score.
 */
export const teacherLearningFollowUpInput = z.object({
  sectionId: z.string().uuid(),
  studentProfileId: z.string().uuid(),
  learningEventId: z.string().uuid(),
  observation: z.string().trim().min(15).max(500),
  approach: z.enum(["check_in", "review_work", "offer_tutoring"]),
  dueInDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
}).strict();

export type TeacherLearningFollowUpInput = z.infer<typeof teacherLearningFollowUpInput>;

export const followUpApproachLabels: Record<TeacherLearningFollowUpInput["approach"], string> = {
  check_in: "Check in with student",
  review_work: "Review learning work",
  offer_tutoring: "Offer tutoring support",
};
