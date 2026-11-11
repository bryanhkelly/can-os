import { describe, expect, it } from "vitest";
import { assertHostedProviderIntent, assertHostedActivationAuthorization } from "@/domain/hosted-academy-provider";

const church = {
  programType: "hosted_academy" as const,
  hostOrganizationId: "church-id",
  hostOrganizationType: "church",
  academicProviderOrganizationId: "can-id",
  academicProviderOrganizationType: "can_network",
  creditIssuingOrganizationId: "can-id",
  creditMode: "credit_bearing" as const,
};

describe("church-hosted provider intent", () => {
  it("allows independent CAN academic and credit issuers for a church-owned site", () => {
    expect(() => assertHostedProviderIntent(church)).not.toThrow();
  });
  it("denies an unrelated external academic provider", () => {
    expect(() => assertHostedProviderIntent({
      ...church, academicProviderOrganizationType: "christian_school",
    })).toThrow(/must be a CAN network organization/);
  });
  it("denies a different credit issuer", () => {
    expect(() => assertHostedProviderIntent({
      ...church, creditIssuingOrganizationId: "other-organization",
    })).toThrow(/same CAN institution as credit issuer/);
  });
  it("preserves single-institution church schools and K-8 extensions", () => {
    expect(() => assertHostedProviderIntent({
      ...church, academicProviderOrganizationId: "church-id",
      academicProviderOrganizationType: "church",
      creditIssuingOrganizationId: "church-id",
    })).not.toThrow();
    expect(() => assertHostedProviderIntent({
      ...church, programType: "high_school_extension",
      academicProviderOrganizationType: "christian_school",
    })).not.toThrow();
  });
});

describe("host-neutral activation needs independently verified authority", () => {
  it("requires the same authorization for a community nonprofit", () => {
    expect(() => assertHostedActivationAuthorization({
      programType: "hosted_academy", hostOrganizationId: "community",
      hostOrganizationType: "community_nonprofit", academicProviderOrganizationId: "can",
      verifiedProgramSiteAuthorizationId: null,
    })).toThrow(/independently verified/);
  });
  it("rejects cross-organization CAN academies while authorization is missing", () => {
    expect(() => assertHostedActivationAuthorization({
      programType: "hosted_academy",
      hostOrganizationId: "church",
      hostOrganizationType: "church",
      academicProviderOrganizationId: "can",
      verifiedProgramSiteAuthorizationId: null,
    })).toThrow(/independently verified/);
  });
  it("does not interfere with a same-organization church school or K-8 extension", () => {
    for (const programType of ["high_school_extension", "hosted_academy"] as const) {
      expect(() => assertHostedActivationAuthorization({
        programType,
        hostOrganizationId: "host",
        hostOrganizationType: "church",
        academicProviderOrganizationId: "host",
        verifiedProgramSiteAuthorizationId: null,
      })).not.toThrow();
    }
  });
  it("denies reclassifying a church/CAN program as a high-school extension to evade authorization", () => {
    expect(() => assertHostedActivationAuthorization({
      programType: "high_school_extension",
      hostOrganizationId: "church",
      hostOrganizationType: "church",
      academicProviderOrganizationId: "can",
      verifiedProgramSiteAuthorizationId: null,
    })).toThrow(/independently verified/);
  });
  it("requires a verified agreement for a non-church school host", () => {
    expect(() => assertHostedActivationAuthorization({
      programType: "high_school_extension",
      hostOrganizationId: "school",
      hostOrganizationType: "christian_school",
      academicProviderOrganizationId: "external",
      verifiedProgramSiteAuthorizationId: null,
    })).toThrow(/independently verified/);
  });
  it("treats a separately checked authorization as the necessary additional input", () => {
    expect(() => assertHostedActivationAuthorization({
      programType: "hosted_academy",
      hostOrganizationId: "church",
      hostOrganizationType: "church",
      academicProviderOrganizationId: "can",
      verifiedProgramSiteAuthorizationId: "verified-record",
    })).not.toThrow();
  });
});
