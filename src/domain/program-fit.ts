import { z } from "zod";

export const programFitInputSchema = z.object({
  policyVersionId: z.string().uuid(),
  offeringVersionId: z.string().uuid(),
  subject: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("site"),
      siteId: z.string().uuid(),
    }).strict(),
    z.object({
      kind: z.literal("proposed_location"),
      geographicAreaId: z.string().uuid(),
    }).strict(),
  ]),
  deliveryContext: z.enum(["remote", "onsite", "hybrid"]),
  assessmentId: z.string().uuid().optional(),
  stage: z.enum([
    "accept_applications",
    "enroll",
    "register_noncredit",
    "deliver",
    "operate",
  ]).default("deliver"),
}).strict().refine(
  (input) => !input.assessmentId || input.subject.kind === "site",
  {
    message: "An existing assessment must be evaluated against its exact Site.",
    path: ["subject"],
  },
);

export const programPolicyEvaluationRowSchema = z.object({
  policyVersionId: z.string().uuid(),
  offeringVersionId: z.string().uuid().nullable(),
  catalogStatus: z.enum(["supported", "conditional", "unavailable", "review_required"]),
  providerSupport: z.enum(["possible", "conditional", "unavailable", "requires_research"]),
  regulatoryStatus: z.enum(["possible", "conditional", "unavailable", "requires_research"]),
  qualificationStatus: z.enum(["draft", "submitted", "withdrawn", "closed", "not_started"]),
  fitRecommendation: z.enum([
    "candidate",
    "needs_resources",
    "needs_verification",
    "not_recommended",
    "not_assessed",
  ]),
  reviewedFitOutcome: z.enum([
    "candidate",
    "needs_resources",
    "needs_verification",
    "not_recommended",
    "not_reviewed",
  ]),
  stageAuthorizationDecision: z.enum([
    "approved",
    "conditional",
    "denied",
    "suspended",
    "revoked",
  ]).nullable(),
  readinessOutcome: z.enum([
    "ready",
    "ready_with_conditions",
    "not_ready",
    "not_required",
  ]).nullable(),
  requiredActionItems: z.array(z.object({
    requirement_id: z.string().uuid(),
    code: z.string(),
    importance: z.enum(["blocking", "required"]),
    status: z.enum(["satisfied", "deficient", "pending", "not_applicable", "missing"]),
    remediation: z.string().nullable(),
  }).strict()),
  activationEligible: z.boolean(),
}).strict();

export const createProgramFitAssessmentInputSchema = z.object({
  assessmentId: z.string().uuid(),
  applicationId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  siteId: z.string().uuid(),
  participantPopulation: z.enum(["unknown", "adults", "minors", "mixed"]).default("unknown"),
  populationEvidenceVersionId: z.string().uuid().optional(),
  deliveryContext: z.enum(["remote", "onsite", "hybrid"]),
  expectedConcurrentLearners: z.number().int().nonnegative().nullable().optional(),
}).strict().refine(
  (input) => input.participantPopulation === "unknown"
    ? input.populationEvidenceVersionId === undefined
    : input.populationEvidenceVersionId !== undefined,
  {
    message: "Known participant populations require a verified evidence version; unknown populations do not accept one.",
    path: ["populationEvidenceVersionId"],
  },
);

export type ProgramFitInput = z.infer<typeof programFitInputSchema>;
export type ProgramPolicyEvaluation = z.infer<typeof programPolicyEvaluationRowSchema>;
export type CreateProgramFitAssessmentInput =
  z.infer<typeof createProgramFitAssessmentInputSchema>;
