import { describe, expect, it } from "vitest";
import { assertChurchHostedProviderIntent } from "@/domain/church-hosted-provider";

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
