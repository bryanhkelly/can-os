import { z } from "zod";
import { publicAdmissionsInterestInput } from "./public-admissions-interest";

/**
 * This is an adult's own follow-up request, not consent supplied by the
 * registrar when importing a mailing list. No child or application data.
 */
export const invitedFamilyInterestInput = publicAdmissionsInterestInput
  .omit({ programId: true })
  .extend({
    invitationBatchId: z.string().uuid(),
    invitationRecipientKey: z.string().uuid(),
    /** Explicit survey mode is still an adult's own expression of interest. */
    responseKind: z.enum(["landing","survey"]).default("landing"),
    contactPreference: z.enum(["email","events","none"]).optional(),

  }).strict();

export type InvitedFamilyInterestInput = z.infer<typeof invitedFamilyInterestInput>;

/** Fixed-choice, adult-only family survey. Never collect child identifiers. */
export const familySurveyFields = z.object({
  grades:z.enum(["middle","high","both"]),
  priority:z.enum(["academics","community","flexibility","faith","communication","affordability"]),
  learningPace:z.enum(["comfortable","curious","support"]),
  contactPreference:z.enum(["email","events","none"]),
  comments:z.string().trim().max(250).default(""),
}).strict();
export type FamilySurveyFields = z.infer<typeof familySurveyFields>;

export function summarizeFamilySurvey(fields:FamilySurveyFields):string {
  const f=familySurveyFields.parse(fields);
  // The canonical interest message has a 500-character bound.
  return [
    "Family planning survey:",
    "Grades: "+f.grades,
    "Priority: "+f.priority,
    "Independent learning: "+f.learningPace,
    "Follow-up: "+f.contactPreference,
    ...(f.comments?["Comments: "+f.comments]:[]),
  ].join(" | ").slice(0,500);
}
