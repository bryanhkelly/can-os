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

/** Outcome explicitly assessed by the human educator, never inferred from telemetry. */
export const teacherFollowUpResolutionInput = z.object({
  actionId: z.string().uuid(),
  supportProvided: z.string().trim().min(15).max(1000),
  outcome: z.enum(["improved", "still_needs_support", "no_observed_change", "not_yet_verified"]),
  outcomeEvidence: z.string().trim().min(15).max(1000),
}).strict();

export type TeacherFollowUpResolutionInput = z.infer<typeof teacherFollowUpResolutionInput>;
export const teacherFollowUpOutcomeLabels: Record<TeacherFollowUpResolutionInput["outcome"], string> = {
  improved: "Progress observed",
  still_needs_support: "Further support needed",
  no_observed_change: "No observed change yet",
  not_yet_verified: "Outcome not yet verified",
};

/** A single explicit resolution note for the canonical Actions lifecycle. */
export function teacherFollowUpResolutionNote(
  input: TeacherFollowUpResolutionInput,
): string {
  const normalized = teacherFollowUpResolutionInput.parse(input);
  return [
    `Support provided: ${normalized.supportProvided}`,
    `Teacher-assessed outcome: ${teacherFollowUpOutcomeLabels[normalized.outcome]}`,
    `Evidence / next step: ${normalized.outcomeEvidence}`,
    "Teacher-reported follow-up only; learning telemetry does not establish mastery or attendance.",
  ].join("\n");
}
