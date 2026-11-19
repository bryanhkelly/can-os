import { describe, expect, it } from "vitest";
import {
  applySiteEnvironmentDeliveryV61, cleanSiteEnvironmentV61, cleanSiteHostingV61, emptySiteStoryV61,
  siteEnvironmentV61Schema, siteHostingV61Schema, siteStoryV61Schema,
} from "./site-information-v61";

describe("Site Information V6.1 planning source", () => {
  it("keeps the responsible Site organization outside the host self-report", () => {
    const draft = siteHostingV61Schema.parse({
      hostingMode: "different", separateHostName: "Community Center",
      separateHostType: "community_nonprofit",
    });
    expect(draft).not.toHaveProperty("organizationId");
    expect(siteHostingV61Schema.safeParse({
      hostingMode: "different", separateHostName: "", separateHostType: "",
    }).success).toBe(false);
    expect(cleanSiteHostingV61({
      hostingMode: "same", separateHostName: "Old host", separateHostType: "church",
    })).toEqual({ hostingMode: "same", separateHostName: "", separateHostType: "" });
  });

  it("allows an undecided host but requires physical-space intent for on-site delivery", () => {
    expect(siteHostingV61Schema.safeParse({
      hostingMode: "undecided", separateHostName: "", separateHostType: "",
    }).success).toBe(true);
    expect(siteEnvironmentV61Schema.safeParse({
      delivery: "both", physicalSpaceArrangement: "",
    }).success).toBe(false);
    expect(siteEnvironmentV61Schema.safeParse({
      delivery: "physical", physicalSpaceArrangement: "planned",
    }).success).toBe(true);
    expect(cleanSiteEnvironmentV61({
      delivery: "digital", physicalSpaceArrangement: "shared_hosted",
    })).toEqual({ delivery: "digital", physicalSpaceArrangement: "" });
  });

  it("keeps all seven Story answers optional and enforces maximum three motivations", () => {
    expect(siteStoryV61Schema.safeParse(emptySiteStoryV61()).success).toBe(true);
    expect(siteStoryV61Schema.safeParse({
      ...emptySiteStoryV61(),
      motivations: ["access", "need", "belonging", "creative"],
    }).success).toBe(false);
    expect(siteStoryV61Schema.safeParse({
      ...emptySiteStoryV61(),
      motivations: ["access", "access"],
    }).success).toBe(false);
    expect(siteStoryV61Schema.safeParse({
      ...emptySiteStoryV61(),
      communityNeed: "a".repeat(1001),
    }).success).toBe(false);
  });

  it("preserves saved Program interests during a delivery-only change", () => {
    expect(applySiteEnvironmentDeliveryV61({
      delivery: "physical", interestIds: ["grades-6-8", "summer"],
    }, { delivery: "digital", physicalSpaceArrangement: "" })).toEqual({
      delivery: "digital", interestIds: ["grades-6-8", "summer"],
    });
    expect(() => applySiteEnvironmentDeliveryV61({
      delivery: "physical", interestIds: ["unsupported-program"],
    }, { delivery: "both", physicalSpaceArrangement: "planned" })).toThrow(
      /need review/,
    );
  });

  it("never accepts unsupported values or extraneous publishing authority", () => {
    expect(siteStoryV61Schema.safeParse({
      ...emptySiteStoryV61(), motivations: ["verified-accreditation"],
    }).success).toBe(false);
    expect(siteStoryV61Schema.safeParse({
      ...emptySiteStoryV61(), published: true,
    }).success).toBe(false);
  });
});
