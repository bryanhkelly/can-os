import {
  jurisdictionProfileSchema,
  isJurisdictionProfileVerificationEvidenceCurrent,
  type JurisdictionProfile,
} from "./jurisdiction-profile";

/** A Site/Program context assembled from authoritative setup records, not a website form. */
export type SchoolJurisdictionContext = {
  state: string;
  locality?: string | null;
  operatingModel: string | null;
  responsibleEntity: "school_of_record" | "host_church" | null;
  programType?: string | null;
  gradeLevels?: string[];
  deliveryModel?: "onsite" | "online" | "hybrid" | null;
  serviceType?: "academic" | "enrichment" | "childcare" | null;
};

export type JurisdictionVersionGate = {
  status: string;
  verificationStatus: string;
  verifiedByPersonId: string | null;
  publishedAt: Date | string | null;
  effectiveAt: Date | string | null;
  nextReviewAt: Date | string | null;
  evidence: unknown;
  verificationEvidence: unknown;
};

export type RequirementDecision = {
  id: string;
  status: "applicable" | "not_applicable" | "legal_review_required";
  reason: string;
  disclosureAudience: "internal_only" | "parent_on_request" |
    "authenticated_family" | "public_required" | "public_optional";
};

function isoDay(value: Date | string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

/**
 * No requirement becomes applicable simply because a school is in the same
 * state. Unknown scope is a legal-review task, not a negative legal finding.
 * This function never grants school opening, registration or accreditation.
 */
export function evaluateSchoolJurisdictionRequirements(
  rawProfile: unknown,
  version: JurisdictionVersionGate,
  school: SchoolJurisdictionContext,
  now = new Date(),
): { reviewRequired: boolean; decisions: RequirementDecision[]; publicDisclosures: Array<{
  id: string; title: string; description: string; evidenceUrls: string[];
}> } {
  const parsed = jurisdictionProfileSchema.safeParse(rawProfile);
  if (!parsed.success) return { reviewRequired: true, decisions: [], publicDisclosures: [] };
  const profile: JurisdictionProfile = parsed.data;
  const today = isoDay(now);
  const published = version.status === "published" &&
    version.verificationStatus === "verified" && Boolean(version.verifiedByPersonId) &&
    Boolean(version.publishedAt) && Boolean(version.effectiveAt) &&
    Boolean(version.nextReviewAt) && Boolean(today) &&
    isoDay(version.publishedAt!) !== null && isoDay(version.publishedAt!)! <= today! &&
    isoDay(version.effectiveAt!) !== null && isoDay(version.effectiveAt!)! <= today! &&
    isoDay(version.nextReviewAt!) !== null &&
    isoDay(version.nextReviewAt!)! >= today! &&
    isJurisdictionProfileVerificationEvidenceCurrent(
      version.verificationEvidence, version.evidence,
    );
  const knownUrls = new Set(profile.evidence.map(source => source.url));
  const decisions: RequirementDecision[] = profile.requirements.map(requirement => {
    const result = (status: RequirementDecision["status"], reason: string): RequirementDecision => ({
      id: requirement.id, status, reason, disclosureAudience: requirement.disclosureAudience,
    });
    if (!published) return result("legal_review_required", "Profile not currently verified and effective");
    if (!requirement.applicability) return result("legal_review_required", "Requirement scope not reviewed");
    const scope = requirement.applicability;
    if (!scope.states.includes(school.state)) return result("not_applicable", "Different state");
    if (!school.operatingModel || !school.responsibleEntity)
      return result("legal_review_required", "School operating authority or model unconfirmed");
    if (!scope.operatingModels.includes(school.operatingModel) ||
      !scope.responsibleEntities.includes(school.responsibleEntity))
      return result("not_applicable", "Different verified operating model or authority");
    if (scope.localities) {
      if (!school.locality) return result("legal_review_required", "Locality not confirmed");
      if (!scope.localities.includes(school.locality)) return result("not_applicable", "Different locality");
    }
    if (scope.programTypes) {
      if (!school.programType) return result("legal_review_required", "Program type not confirmed");
      if (!scope.programTypes.includes(school.programType)) return result("not_applicable", "Different program");
    }
    if (scope.deliveryModels) {
      if (!school.deliveryModel) return result("legal_review_required", "Delivery model not confirmed");
      if (!scope.deliveryModels.includes(school.deliveryModel)) return result("not_applicable", "Different delivery model");
    }
    if (scope.serviceTypes) {
      if (!school.serviceType) return result("legal_review_required", "Service type not confirmed");
      if (!scope.serviceTypes.includes(school.serviceType)) return result("not_applicable", "Different service");
    }
    if (scope.gradeLevels) {
      if (!school.gradeLevels?.length) return result("legal_review_required", "Grades not confirmed");
      if (!school.gradeLevels.some(grade => scope.gradeLevels!.includes(grade)))
        return result("not_applicable", "Different grades");
    }
    if (requirement.effectiveOn && requirement.effectiveOn > today!)
      return result("legal_review_required", "Requirement not yet effective");
    if (requirement.reviewBy && requirement.reviewBy < today!)
      return result("legal_review_required", "Requirement review expired");
    if (!requirement.evidenceIds.length ||
      requirement.evidenceIds.some(url => !knownUrls.has(url)))
      return result("legal_review_required", "Missing current source citation");
    return result("applicable", "Explicit scope and evidence matched");
  });
  const publicDisclosures = profile.requirements.flatMap(requirement => {
    const decision = decisions.find(item => item.id === requirement.id);
    return decision?.status === "applicable" &&
      (decision.disclosureAudience === "public_required" ||
       decision.disclosureAudience === "public_optional")
      ? [{ id: requirement.id, title: requirement.title,
          description: requirement.description, evidenceUrls: requirement.evidenceIds }]
      : [];
  });
  return {
    reviewRequired: !published || decisions.some(item => item.status === "legal_review_required"),
    decisions,
    publicDisclosures,
  };
}
