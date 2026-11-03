import { describe, expect, it } from "vitest";
import { evaluateSchoolJurisdictionRequirements } from "@/domain/jurisdiction-applicability";

const evidence = [{
  title: "Official source", url: "https://state.example.gov/rule",
  authority: "State education office", checkedAt: "2026-10-30T12:00:00.000Z",
}];
const profile = {
  summary: "Reviewed operating guidance",
  operatingModels: ["church_hosted"],
  evidence,
  requirements: [{
    id: "safety-1", title: "Local safety disclosure", description: "Reviewed requirement",
    responsibleParty: "church", phase: "before_opening",
    evidenceIds: [evidence[0].url], disclosureAudience: "public_required",
    applicability: {
      states: ["CA"], operatingModels: ["church_hosted"],
      responsibleEntities: ["host_church"], serviceTypes: ["enrichment"],
    },
  }],
};
const version = {
  status: "published", verificationStatus: "verified", verifiedByPersonId: "reviewer",
  publishedAt: "2026-10-31T00:00:00Z", effectiveAt: "2026-11-01T00:00:00Z",
  nextReviewAt: "2026-12-01T00:00:00Z", evidence,
  verificationEvidence: {
    note: "Independently compared the complete current official record.",
    sources: evidence,
  },
};
const school = {
  state: "CA", operatingModel: "church_hosted",
  responsibleEntity: "host_church" as const, serviceType: "enrichment" as const,
};
const now = new Date("2026-11-03T12:00:00Z");

describe("school-specific jurisdiction requirements", () => {
  it("publishes only explicitly matching reviewed public disclosures", () => {
    const result = evaluateSchoolJurisdictionRequirements(profile, version, school, now);
    expect(result.reviewRequired).toBe(false);
    expect(result.decisions[0].status).toBe("applicable");
    expect(result.publicDisclosures).toHaveLength(1);
  });
  it("does not apply an enrichment rule to academic school programs", () => {
    const result = evaluateSchoolJurisdictionRequirements(profile, version,
      { ...school, serviceType: "academic" }, now);
    expect(result.decisions[0].status).toBe("not_applicable");
    expect(result.publicDisclosures).toEqual([]);
  });
  it("fails closed on missing school authority or scope", () => {
    const unknown = evaluateSchoolJurisdictionRequirements(profile, version,
      { ...school, responsibleEntity: null }, now);
    expect(unknown.reviewRequired).toBe(true);
    expect(unknown.publicDisclosures).toEqual([]);
    const legacy = evaluateSchoolJurisdictionRequirements({
      ...profile, requirements: [{ ...profile.requirements[0], applicability: undefined }],
    }, version, school, now);
    expect(legacy.decisions[0].status).toBe("legal_review_required");
  });
  it("withdraws claims for expired profiles, changed evidence and internal-only rules", () => {
    for (const override of [
      { nextReviewAt: "2026-11-02T00:00:00Z" },
      { verificationStatus: "unverified" },
      { evidence: [{ ...evidence[0], checkedAt: "2026-11-02T00:00:00Z" }] },
    ]) {
      const result = evaluateSchoolJurisdictionRequirements(profile,
        { ...version, ...override }, school, now);
      expect(result.reviewRequired).toBe(true);
      expect(result.publicDisclosures).toEqual([]);
    }
    const internal = evaluateSchoolJurisdictionRequirements({
      ...profile, requirements: [{ ...profile.requirements[0], disclosureAudience: "internal_only" }],
    }, version, school, now);
    expect(internal.decisions[0].status).toBe("applicable");
    expect(internal.publicDisclosures).toEqual([]);
  });
});
