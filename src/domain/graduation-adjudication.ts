import { auditGraduationCredits, type CreditEvidence, type CreditRequirement } from "@/domain/graduation-credit-audit";

export type GraduationAdjudication = {
  decision: "approved" | "denied";
  audit: ReturnType<typeof auditGraduationCredits>;
  requirementSetId: string;
  transcriptIssuanceId: string;
};

/**
 * Produce a decision payload only from an institution-approved requirements
 * version and an issued transcript belonging to the same student and issuer.
 * A caller must independently authorize the adjudicator and persist the result.
 */
export function adjudicateGraduation(input: {
  requirementSetId: string;
  transcriptIssuanceId: string;
  requirementIssuerId: string;
  transcriptIssuerId: string;
  studentProfileId: string;
  transcriptStudentProfileId: string;
  requirements: readonly CreditRequirement[];
  evidence: readonly CreditEvidence[];
  decision: "approved" | "denied";
}): GraduationAdjudication {
  if (!input.requirementSetId || !input.transcriptIssuanceId ||
      !input.requirementIssuerId || input.requirementIssuerId !== input.transcriptIssuerId ||
      !input.studentProfileId || input.studentProfileId !== input.transcriptStudentProfileId) {
    throw new Error("Graduation requires matching institutional issuer and student evidence");
  }
  const audit = auditGraduationCredits(input.requirements, input.evidence);
  if (input.decision === "approved" && audit.status !== "requirements_met") {
    throw new Error("Graduation cannot be approved with deficient or incomplete credits");
  }
  return {
    decision: input.decision,
    audit,
    requirementSetId: input.requirementSetId,
    transcriptIssuanceId: input.transcriptIssuanceId,
  };
}
