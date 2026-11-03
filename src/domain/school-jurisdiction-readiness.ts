import {
  jurisdictionProfileSchema,
  type JurisdictionProfile,
} from "./jurisdiction-profile";
import type { RequirementDecision } from "./jurisdiction-applicability";

/** Internal school-operator view. It has NO authority to publish claims or clear opening. */
export type JurisdictionPolicySource = {
  title: string;
  url: string;
  authority: string;
  checkedAt: string;
};

export type SchoolJurisdictionReadiness = {
  status: "verified_policy" | "review_required";
  reason: string | null;
  profileVersionId: string | null;
  revision: string | null;
  reviewedAt: string | null;
  nextReviewAt: string | null;
  requirements: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    responsibleParty: "can" | "church" | "family";
    phase: "before_opening" | "before_enrollment" | "follow_up";
    applicability: RequirementDecision["status"];
    reason: string;
    nextAction: string;
    sources: JurisdictionPolicySource[];
  }>;
  fundingOpportunities: Array<{
    id: string;
    name: string;
    summary: string;
    /** This describes the reviewed state-profile research, NOT this school's eligibility. */
    researchEligibilityStatus: JurisdictionProfile["fundingPrograms"][number]["eligibilityStatus"];
    schoolEligibility: "not_determined";
    providerParticipation: "not_verified";
    governmentApproval: "not_verified";
    nextAction: string;
    sources: JurisdictionPolicySource[];
  }>;
};

export function unavailableSchoolJurisdictionReadiness(
  reason: string,
  profileVersionId: string | null = null,
  revision: string | null = null,
): SchoolJurisdictionReadiness {
  return {
    status: "review_required", reason, profileVersionId, revision,
    reviewedAt: null, nextReviewAt: null,
    requirements: [], fundingOpportunities: [],
  };
}

/**
 * Only independently verified, effective policies are projected as school-specific
 * requirements and researched funding opportunities. Draft/stale material is withheld.
 * Actual provider participation and government decisions require separate records.
 */
export function projectSchoolJurisdictionReadiness(input: {
  profile: unknown;
  decisions: readonly RequirementDecision[];
  verifiedCurrent: boolean;
  profileVersionId: string;
  revision: string;
  reviewedAt: Date | string | null;
  nextReviewAt: Date | string | null;
}): SchoolJurisdictionReadiness {
  const empty = unavailableSchoolJurisdictionReadiness(
    "Current independently verified state policy is unavailable",
    input.profileVersionId, input.revision,
  );
  if (!input.verifiedCurrent) return empty;
  const parsed = jurisdictionProfileSchema.safeParse(input.profile);
  if (!parsed.success) return empty;
  const profile = parsed.data;
  const sources = profile.evidence.filter(source => source.url.startsWith("https://"));
  const sourceFor = (ids: string[]) => sources.filter(source => ids.includes(source.url));
  const decisions = new Map(input.decisions.map(item => [item.id, item]));
  const toIso = (value: Date | string | null): string | null => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };
  return {
    status: "verified_policy",
    reason: null,
    profileVersionId: input.profileVersionId,
    revision: input.revision,
    reviewedAt: toIso(input.reviewedAt),
    nextReviewAt: toIso(input.nextReviewAt),
    requirements: profile.requirements.flatMap(requirement => {
      const decision = decisions.get(requirement.id);
      if (!decision) return [];
      const applicability = decision.status;
      return [{
        id: requirement.id,
        title: requirement.title,
        description: requirement.description,
        category: requirement.category ?? "other",
        responsibleParty: requirement.responsibleParty,
        phase: requirement.phase,
        applicability,
        reason: decision.reason,
        nextAction: applicability === "applicable"
          ? "Complete and document this obligation through the existing launch and compliance workflows."
          : applicability === "legal_review_required"
            ? "Request CAN legal review before treating this requirement as applicable or cleared."
            : "No action for this school under the currently verified policy scope.",
        sources: sourceFor(requirement.evidenceIds),
      }];
    }),
    fundingOpportunities: profile.fundingPrograms.flatMap(program => {
      const citations = sourceFor(program.evidenceIds);
      if (citations.length === 0) return [];
      return [{
        id: program.id,
        name: program.name,
        summary: program.summary,
        researchEligibilityStatus: program.eligibilityStatus,
        schoolEligibility: "not_determined" as const,
        providerParticipation: "not_verified" as const,
        governmentApproval: "not_verified" as const,
        nextAction: "CAN must confirm provider participation and this school's program-specific eligibility with the responsible authority.",
        sources: citations,
      }];
    }),
  };
}
