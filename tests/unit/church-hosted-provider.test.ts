import { describe, expect, it } from "vitest";
import { assertChurchHostedProviderIntent, assertChurchHostedActivationAuthorization } from "@/domain/church-hosted-provider";

const church = {
  programType: "church_hosted_academy" as const,
  hostOrganizationId: "church-id",
  hostOrganizationType: "church",
  academicProviderOrganizationId: "can-id",
  academicProviderOrganizationType: "can_network",
  creditIssuingOrganizationId: "can-id",
  creditMode: "credit_bearing" as const,
};

describe("church-hosted provider intent", () => {
  it("allows independent CAN academic and credit issuers for a church-owned site", () => {
    expect(() => assertChurchHostedProviderIntent(church)).not.toThrow();
  });
  it("denies an unrelated external academic provider", () => {
    expect(() => assertChurchHostedProviderIntent({
      ...church, academicProviderOrganizationType: "christian_school",
    })).toThrow(/must be a CAN network organization/);
  });
  it("denies a different credit issuer", () => {
    expect(() => assertChurchHostedProviderIntent({
      ...church, creditIssuingOrganizationId: "other-organization",
    })).toThrow(/same CAN institution as credit issuer/);
  });
  it("preserves single-institution church schools and K-8 extensions", () => {
    expect(() => assertChurchHostedProviderIntent({
      ...church, academicProviderOrganizationId: "church-id",
      academicProviderOrganizationType: "church",
      creditIssuingOrganizationId: "church-id",
    })).not.toThrow();
    expect(() => assertChurchHostedProviderIntent({
      ...church, programType: "high_school_extension",
      academicProviderOrganizationType: "christian_school",
    })).not.toThrow();
  });
});

describe("church-hosted activation needs independently verified authority", () => {
  it("rejects cross-organization CAN academies while authorization is missing", () => {
    expect(() => assertChurchHostedActivationAuthorization({
      programType: "church_hosted_academy",
      hostOrganizationId: "church",
      hostOrganizationType: "church",
      academicProviderOrganizationId: "can",
      verifiedProgramSiteAuthorizationId: null,
    })).toThrow(/independently verified/);
  });
  it("does not interfere with a same-organization church school or K-8 extension", () => {
    for (const programType of ["high_school_extension", "church_hosted_academy"] as const) {
      expect(() => assertChurchHostedActivationAuthorization({
        programType,
        hostOrganizationId: "host",
        hostOrganizationType: "church",
        academicProviderOrganizationId: "host",
        verifiedProgramSiteAuthorizationId: null,
      })).not.toThrow();
    }
  });
  it("denies reclassifying a church/CAN program as a high-school extension to evade authorization", () => {
    expect(() => assertChurchHostedActivationAuthorization({
      programType: "high_school_extension",
      hostOrganizationId: "church",
      hostOrganizationType: "church",
      academicProviderOrganizationId: "can",
      verifiedProgramSiteAuthorizationId: null,
    })).toThrow(/independently verified/);
  });
  it("preserves an independently operated K-8 extension where the host is a school", () => {
    expect(() => assertChurchHostedActivationAuthorization({
      programType: "high_school_extension",
      hostOrganizationId: "school",
      hostOrganizationType: "christian_school",
      academicProviderOrganizationId: "external",
      verifiedProgramSiteAuthorizationId: null,
    })).not.toThrow();
  });
  it("treats a separately checked authorization as the necessary additional input", () => {
    expect(() => assertChurchHostedActivationAuthorization({
      programType: "church_hosted_academy",
      hostOrganizationId: "church",
      hostOrganizationType: "church",
      academicProviderOrganizationId: "can",
      verifiedProgramSiteAuthorizationId: "verified-record",
    })).not.toThrow();
  });
});
