import { describe, expect, it } from "vitest";
import {
  projectAvailableOfferings,
  programDiscoveryInputSchema,
  type ProgramAvailability,
  type PublishedOffering,
} from "../../src/domain/program-discovery";

const product: PublishedOffering = {
  offeringId: "00000000-0000-4000-8000-000000000001",
  offeringVersionId: "00000000-0000-4000-8000-000000000002",
  code: "adult-digital-skills",
  title: "Adult Digital Skills",
  versionNo: 1,
};

function availability(
  policyVersionId: string,
  patch: Partial<ProgramAvailability> = {},
): ProgramAvailability {
  return {
    policyVersionId,
    offeringVersionId: product.offeringVersionId,
    providerSupport: "possible",
    regulatoryStatus: "possible",
    catalogStatus: "supported",
    explanation: "Provider support and regulatory research are current.",
    ...patch,
  };
}

describe("canonical program discovery", () => {
  it("validates existing Site and proposed-location discovery contexts", () => {
    expect(programDiscoveryInputSchema.parse({
      subject: { kind: "site", siteId: "00000000-0000-4000-8000-000000000003" },
      deliveryContext: "onsite",
    }).subject.kind).toBe("site");
    expect(programDiscoveryInputSchema.parse({
      subject: { kind: "proposed_location", geographicAreaId: "00000000-0000-4000-8000-000000000004" },
      deliveryContext: "remote",
    }).subject.kind).toBe("proposed_location");
    expect(() => programDiscoveryInputSchema.parse({
      subject: { kind: "proposed_location", geographicAreaId: "not-a-uuid" },
      deliveryContext: "onsite",
    })).toThrow();
    expect(() => programDiscoveryInputSchema.parse({
      subject: { kind: "site", siteId: "00000000-0000-4000-8000-000000000003" },
      deliveryContext: "onsite",
      activationEligible: true,
    })).toThrow();
  });

  it("shows each published Offering once while retaining all policy-specific availability", () => {
    const result = projectAvailableOfferings([product, product], [
      availability("00000000-0000-4000-8000-000000000005"),
      availability("00000000-0000-4000-8000-000000000006", {
        catalogStatus: "review_required",
        providerSupport: "requires_research",
        explanation: "Provider support has not been researched.",
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      offering: product,
      activationEligible: false,
      availability: [
        { catalogStatus: "supported" },
        { catalogStatus: "review_required" },
      ],
    });
  });

  it("does not present Blueprint references or unmatched policies as Offerings", () => {
    expect(projectAvailableOfferings([product], [
      availability("00000000-0000-4000-8000-000000000099", {
        offeringVersionId: "00000000-0000-4000-8000-000000000098",
      }),
    ])).toEqual([]);
    expect(projectAvailableOfferings([], [
      availability("00000000-0000-4000-8000-000000000005"),
    ])).toEqual([]);
  });
});
