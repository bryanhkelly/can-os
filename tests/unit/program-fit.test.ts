import { describe, expect, it } from "vitest";
import {
  createProgramFitAssessmentInputSchema,
  programFitInputSchema,
  programPolicyEvaluationRowSchema,
} from "../../src/domain/program-fit";

const siteId = "00000000-0000-4000-8000-000000000001";
const policyVersionId = "00000000-0000-4000-8000-000000000002";
const offeringVersionId = "00000000-0000-4000-8000-000000000003";

const evaluation = {
  policyVersionId,
  offeringVersionId,
  catalogStatus: "conditional",
  providerSupport: "possible",
  regulatoryStatus: "conditional",
  qualificationStatus: "submitted",
  fitRecommendation: "needs_verification",
  reviewedFitOutcome: "needs_verification",
  stageAuthorizationDecision: "conditional",
  readinessOutcome: "ready_with_conditions",
  requiredActionItems: [{
    requirement_id: "00000000-0000-4000-8000-000000000004",
    code: "site-safety",
    importance: "blocking",
    status: "pending",
    remediation: "Submit current site-safety evidence.",
  }],
  activationEligible: false,
};

describe("canonical program-fit contracts", () => {
  it("accepts a scoped Site or proposed-location evaluation request", () => {
    expect(programFitInputSchema.parse({
      policyVersionId,
      offeringVersionId,
      subject: { kind: "site", siteId },
      deliveryContext: "onsite",
    }).stage).toBe("deliver");
    expect(programFitInputSchema.parse({
      policyVersionId,
      offeringVersionId,
      subject: {
        kind: "proposed_location",
        geographicAreaId: "00000000-0000-4000-8000-000000000005",
      },
      deliveryContext: "remote",
      stage: "register_noncredit",
    }).stage).toBe("register_noncredit");
    expect(() => programFitInputSchema.parse({
      policyVersionId,
      offeringVersionId,
      subject: { kind: "site", siteId },
      deliveryContext: "onsite",
      activationEligible: true,
    })).toThrow();
  });

  it("requires an existing assessment to stay bound to a concrete Site", () => {
    expect(() => programFitInputSchema.parse({
      policyVersionId,
      offeringVersionId,
      subject: {
        kind: "proposed_location",
        geographicAreaId: "00000000-0000-4000-8000-000000000005",
      },
      deliveryContext: "remote",
      assessmentId: "00000000-0000-4000-8000-000000000006",
    })).toThrow();
  });

  it("requires verified-evidence references for known participant populations", () => {
    const base = {
      assessmentId: "00000000-0000-4000-8000-000000000006",
      applicationId: "00000000-0000-4000-8000-000000000007",
      policyVersionId,
      siteId,
      deliveryContext: "onsite",
    };
    expect(createProgramFitAssessmentInputSchema.parse(base).participantPopulation).toBe("unknown");
    expect(() => createProgramFitAssessmentInputSchema.parse({
      ...base,
      participantPopulation: "adults",
    })).toThrow();
    expect(createProgramFitAssessmentInputSchema.parse({
      ...base,
      participantPopulation: "adults",
      populationEvidenceVersionId: "00000000-0000-4000-8000-000000000008",
    }).participantPopulation).toBe("adults");
    expect(() => createProgramFitAssessmentInputSchema.parse({
      ...base,
      populationEvidenceVersionId: "00000000-0000-4000-8000-000000000008",
    })).toThrow();
  });

  it("preserves conditional and incomplete fit results without treating them as activation", () => {
    expect(programPolicyEvaluationRowSchema.parse(evaluation)).toEqual(evaluation);
  });

  it("rejects malformed or incomplete database evaluation results", () => {
    expect(() => programPolicyEvaluationRowSchema.parse({
      ...evaluation,
      activationEligible: "true",
    })).toThrow();
    expect(() => programPolicyEvaluationRowSchema.parse({
      ...evaluation,
      requiredActionItems: [{
        requirement_id: "not-a-uuid",
        code: "site-safety",
        importance: "blocking",
        status: "pending",
        remediation: null,
      }],
    })).toThrow();
  });
});
