import { z } from "zod";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

const question = z.object({
  prompt: z.string().trim().min(5).max(1000),
  type: z.enum(["single_choice", "multiple_choice", "rating", "likert", "nps", "text"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(250)).max(12),
  ratingMin: z.number().int().min(0).max(100).nullable(),
  ratingMax: z.number().int().min(1).max(100).nullable(),
}).strict().superRefine((value, ctx) => {
  const choice = value.type === "single_choice" || value.type === "multiple_choice";
  const numeric = ["rating", "likert", "nps"].includes(value.type);
  if (choice && value.options.length < 2)
    ctx.addIssue({ code: "custom", message: "Choice questions need at least two options" });
  if (!choice && value.options.length)
    ctx.addIssue({ code: "custom", message: "Only choice questions accept options" });
  if (numeric && (value.ratingMin === null || value.ratingMax === null ||
      value.ratingMax <= value.ratingMin))
    ctx.addIssue({ code: "custom", message: "Numeric range must be increasing" });
  if (!numeric && (value.ratingMin !== null || value.ratingMax !== null))
    ctx.addIssue({ code: "custom", message: "Only rating questions accept a numeric range" });
  if (new Set(value.options.map(option => option.toLowerCase())).size !== value.options.length)
    ctx.addIssue({ code: "custom", message: "Duplicate answer options" });
});

export const createSurveyDraftInput = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{2,63}$/),
  title: z.string().trim().min(5).max(160),
  purposeCode: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,79}$/),
  intendedAudience: z.enum(["learner", "guardian", "professional", "operator", "any"]),
  questions: z.array(question).min(1).max(20),
}).strict();

export type CreateSurveyDraftInput = z.infer<typeof createSurveyDraftInput>;

export function canonicalSurveyDraftDatabaseRole(
  actor: Pick<CommandContext, "scope" | "capabilities">,
): string {
  if (!actor.capabilities.has("survey.draft.create"))
    throw new AuthorizationError("survey.draft.create");
  const ids = actor.scope.organizationIds;
  if (ids?.length !== 1 || !z.string().uuid().safeParse(ids[0]).success)
    throw new AuthorizationError("one canonical survey author organization");
  return "can_v30_survey_draft_author_" + ids[0]!.replaceAll("-", "").toLowerCase();
}
