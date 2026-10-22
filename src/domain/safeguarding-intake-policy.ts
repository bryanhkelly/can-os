import { z } from "zod";

/**
 * Input contract only. This is NOT a filing endpoint, mandated report,
 * emergency responder, investigator, or proof that an agency was contacted.
 * Authorization, case privacy and state reporting obligations require a
 * separately reviewed server workflow before an onsite launch.
 */
export const safeguardingConcernKind = z.enum([
  "abuse_or_neglect",
  "exploitation_or_coercion",
  "bullying_or_peer_harm",
  "violence_or_threat",
  "substance_or_medical_safety",
  "self_harm_or_welfare",
  "other_or_uncertain",
]);

export const safeguardingObservationSchema = z.object({
  siteId: z.string().uuid(),
  programId: z.string().uuid().optional(),
  studentProfileId: z.string().uuid().optional(),
  concernKinds: z.array(safeguardingConcernKind).min(1).max(7),
  source: z.enum(["direct_observation", "student_disclosure", "third_party_report", "uncertain"]),
  immediateDanger: z.enum(["yes", "no", "unsure"]),
  observedAt: z.string().datetime({ offset: true }),
  factualObservation: z.string().trim().min(10).max(3000),
  immediateActions: z.string().trim().max(1500).optional(),
}).strict().superRefine((data, ctx) => {
  if (new Set(data.concernKinds).size !== data.concernKinds.length) {
    ctx.addIssue({ code: "custom", path: ["concernKinds"], message: "Duplicate concern category" });
  }
});

export type SafeguardingObservationInput = z.infer<typeof safeguardingObservationSchema>;

/**
 * Display-only routing hints, never a legal threshold determination or a
 * workflow status. Staff must use the locally approved emergency and direct
 * outside-reporting instructions without waiting for a platform response.
 */
export function safeguardingIntakeGuidance(value: SafeguardingObservationInput) {
  const input = safeguardingObservationSchema.parse(value);
  const potentialChildProtection = input.concernKinds.some(kind =>
    kind === "abuse_or_neglect" || kind === "exploitation_or_coercion");
  return {
    requiresImmediateHumanReview: input.immediateDanger !== "no" ||
      potentialChildProtection ||
      input.concernKinds.some(kind => kind === "self_harm_or_welfare" || kind === "violence_or_threat" ||
        kind === "substance_or_medical_safety"),
    showEmergencyHelpFirst: input.immediateDanger === "yes",
    showDirectOutsideReportingInstructions: potentialChildProtection,
    neverAssumeGuardianIsSafeToNotify: true,
    outsideAgencyReportConfirmed: false,
    note: "Document observations, not diagnoses or findings. In immediate danger, seek emergency help. Follow directly applicable external-reporting duties without waiting for a school approval or this application.",
  } as const;
}
