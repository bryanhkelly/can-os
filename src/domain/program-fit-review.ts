import { z } from "zod";

export const createProgramFitReviewInputSchema = z.object({
  reviewId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  reviewOutcome: z.enum([
    "candidate",
    "needs_resources",
    "needs_verification",
    "not_recommended",
  ]),
  rationale: z.string().trim().min(1).max(4000),
  overrideJustification: z.string().trim().min(1).max(4000).optional(),
  overrideEvidenceVersionId: z.string().uuid().optional(),
}).strict().refine(
  (input) => (input.overrideJustification === undefined)
    === (input.overrideEvidenceVersionId === undefined),
  {
    message: "An override requires both a justification and evidence reference.",
    path: ["overrideEvidenceVersionId"],
  },
);

export type CreateProgramFitReviewInput =
  z.infer<typeof createProgramFitReviewInputSchema>;
