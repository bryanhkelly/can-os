import { describe, expect, it } from "vitest";
import {
  evaluateSchoolJurisdictionRequirements,
  isCurrentVerifiedJurisdictionProfileVersion,
  requiresFutureJurisdictionPolicyReview,
} from "@/domain/jurisdiction-applicability";
import {
  jurisdictionReviewScopeFingerprint,
  projectSchoolJurisdictionReadiness,
  unavailableSchoolJurisdictionReadiness,
} from "@/domain/school-jurisdiction-readiness";

const now = new Date("2026-11-03T18:00:00Z");
const evidence = [{
  title: "State education rules",
  url: "https://education.example.gov/rules",
  authority: "State education agency",
  checkedAt: "2026-11-02T18:00:00Z",
}];
const version = {
  status: "published",
  verificationStatus: "verified",
  verifiedByPersonId: "independent-reviewer",
  publishedAt: "2026-11-02T18:00:00Z",
  effectiveAt: "2026-11-02T18:00:00Z",
  nextReviewAt: "2027-01-01T00:00:00Z",
  evidence,
  verificationEvidence: {
    note: "An independent reviewer checked each current official source.",
    sources: evidence,
  },
};
const school = {
  state: "CA",
  locality: "Alameda",
  operatingModel: "church-hosted",
  responsibleEntity: "school_of_record" as const,
  programType: "academic",
  deliveryModel: "onsite" as const,
  serviceType: "academic" as const,
  gradeLevels: ["K"],
};
const requirement = {
  id: "school-notice",
  title: "School notice",
  description: "Determine the notice requirement for the school's model.",
  responsibleParty: "can" as const,
  phase: "before_opening" as const,
  disclosureAudience: "public_optional" as const,
  category: "authorization" as const,
  evidenceIds: [evidence[0].url],
  applicability: {
    states: ["CA"], localities: ["Alameda"],
    operatingModels: ["church-hosted"],
    responsibleEntities: ["school_of_record" as const],
    programTypes: ["academic"],
    deliveryModels: ["onsite" as const],
    serviceTypes: ["academic" as const],
    gradeLevels: ["K"],
  },
};
const profile = {
  summary: "Reviewed school launch policy",
  requirements: [requirement],
  fundingPrograms: [{
    id: "funding", name: "Choice program",
    summary: "A researched funding opportunity.",
    eligibilityStatus: "verified" as const,
    evidenceIds: [evidence[0].url],
  }, {
    id: "unsourced", name: "Unverified opportunity",
    summary: "No source; must not enter school-specific readiness.",
    eligibilityStatus: "unknown" as const,
    evidenceIds: [],
  }],
  evidence,
};

describe("school-specific jurisdiction and funding readiness", () => {
  it("projects a verified, exactly matching requirement and linked sources", () => {
    const evaluation = evaluateSchoolJurisdictionRequirements(profile,version,school,now);
    expect(evaluation.reviewRequired).toBe(false);
    expect(evaluation.decisions[0]?.status).toBe("applicable");
    expect(evaluation.publicDisclosures).toHaveLength(1);
    const projected = projectSchoolJurisdictionReadiness({
      profile, decisions:evaluation.decisions, verifiedCurrent:true,
      profileVersionId:"version-id",revision:"v2",
      reviewedAt:"2026-11-02T18:00:00Z",nextReviewAt:version.nextReviewAt,
    });
    expect(projected.status).toBe("verified_policy");
    expect(projected.requirements[0]?.sources[0]?.url).toBe(evidence[0].url);
    expect(projected.requirements[0]?.responsibleParty).toBe("can");
    expect(projected.nextReviewAt).toBe("2027-01-01T00:00:00.000Z");
  });
  it("never mistakes researched funding eligibility for provider or government approval", () => {
    const evaluation = evaluateSchoolJurisdictionRequirements(profile,version,school,now);
    const projected = projectSchoolJurisdictionReadiness({
      profile,decisions:evaluation.decisions,verifiedCurrent:true,
      profileVersionId:"id",revision:"r1",reviewedAt:null,nextReviewAt:null,
    });
    expect(projected.fundingOpportunities).toHaveLength(1);
    expect(projected.fundingOpportunities[0]).toMatchObject({
      researchEligibilityStatus:"verified",
      schoolEligibility:"not_determined",
      providerParticipation:"not_verified",
      governmentApproval:"not_verified",
    });
  });
  it("requires human legal review for incomplete school location", () => {
    const result = evaluateSchoolJurisdictionRequirements(
      profile,version,{...school,locality:null},now,
    );
    expect(result.reviewRequired).toBe(true);
    expect(result.decisions[0]?.status).toBe("legal_review_required");
    expect(result.publicDisclosures).toHaveLength(0);
  });
  it("does not clear legal review from a published but empty policy profile", () => {
    const result = evaluateSchoolJurisdictionRequirements(
      {...profile,requirements:[]},version,school,now,
    );
    expect(result.reviewRequired).toBe(true);
  });
  it("withdraws current policy and all sourced details on expiry or revoked verification", () => {
    const expired = {...version,nextReviewAt:"2026-11-01T00:00:00Z"};
    expect(isCurrentVerifiedJurisdictionProfileVersion(expired,now)).toBe(false);
    const evaluation = evaluateSchoolJurisdictionRequirements(profile,expired,school,now);
    expect(evaluation.publicDisclosures).toHaveLength(0);
    expect(projectSchoolJurisdictionReadiness({
      profile,decisions:evaluation.decisions,verifiedCurrent:false,
      profileVersionId:"id",revision:"r1",reviewedAt:null,nextReviewAt:null,
    }).fundingOpportunities).toHaveLength(0);
    expect(isCurrentVerifiedJurisdictionProfileVersion({
      ...version,verificationStatus:"unverified",
    },now)).toBe(false);
  });
  it("requires renewed policy review when a future school year starts after the policy review horizon", () => {
    expect(requiresFutureJurisdictionPolicyReview(
      version.nextReviewAt, ["2027-08-15"], now,
    )).toBe(true);
    expect(requiresFutureJurisdictionPolicyReview(
      version.nextReviewAt, ["2026-08-15", "2026-11-20"], now,
    )).toBe(false);
    expect(requiresFutureJurisdictionPolicyReview(
      version.nextReviewAt, ["2027-02-30"], now,
    )).toBe(true);
  });
  it("detects changed legal scope without storing the street address in an Action", () => {
    const original = {
      address:{state:"CA",county:"Alameda",line1:"100 Main Street"},
      schoolYears:[{key:"2026-2027",status:"draft"}],
      deliveryModel:{onsite:true,liveOnline:false},
    };
    const fingerprint = jurisdictionReviewScopeFingerprint(original);
    expect(fingerprint).toBe(jurisdictionReviewScopeFingerprint({
      schoolYears:[{status:"draft",key:"2026-2027"}],
      deliveryModel:{liveOnline:false,onsite:true},
      address:{line1:"100 Main Street",county:"Alameda",state:"CA"},
    }));
    expect(jurisdictionReviewScopeFingerprint({
      ...original,address:{...original.address,line1:"200 Main Street"},
    })).not.toBe(fingerprint);
    expect(jurisdictionReviewScopeFingerprint({
      ...original,schoolYears:[{key:"2027-2028",status:"draft"}],
    })).not.toBe(fingerprint);
    expect(fingerprint).not.toContain("Main Street");
  });
  it("returns no candidate requirements or funding if profile is absent or unverified", () => {
    const unverified = unavailableSchoolJurisdictionReadiness("Site state requires confirmation");
    expect(unverified).toMatchObject({
      status:"review_required",requirements:[],fundingOpportunities:[],
    });
    const missing = projectSchoolJurisdictionReadiness({
      profile:{...profile,evidence:[]},
      decisions:[],verifiedCurrent:true,profileVersionId:"id",
      revision:"r1",reviewedAt:null,nextReviewAt:null,
    });
    expect(missing.status).toBe("review_required");
  });
});
