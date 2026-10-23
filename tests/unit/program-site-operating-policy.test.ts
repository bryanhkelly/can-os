import { describe, expect, it } from "vitest";
import {
  assertChurchCANOperatingIdentity, normalizeOperatingServices,
  assertOperatingAgreementEvidence, assertCurrentOperatingAuthorization,
  recommendedChurchOperatingServices,
} from "@/domain/program-site-operating-policy";
const now = new Date("2026-10-23T16:00:00Z");
const identity = {
  programId: "program", programOrganizationId: "church",
  siteId: "church-site", siteOrganizationId: "church",
  hostOrganizationId: "church", hostOrganizationType: "church",
  institutionOrganizationId: "can", institutionOrganizationType: "can_network",
  creditIssuingOrganizationId: "can",
};
const approval = {
  status: "approved", programId: "program", siteId: "church-site",
  hostOrganizationId: "church", institutionOrganizationId: "can",
  services: ["academic_instruction", "onsite_supervision"] as const,
  effectiveFrom: new Date("2026-10-01"), effectiveThrough: new Date("2027-10-01"),
  reviewedAt: new Date("2026-10-20"), reviewedByPersonId: "can-reviewer",
  requestedByPersonId: "church-requester", revokedAt: null,
};
const document = {
  subjectType: "program", subjectId: "program",
  category: "program_site_operating_agreement",
  verifiedAt: new Date("2026-10-18"), verifiedByPersonId: "independent-verifier",
  expiresAt: new Date("2027-11-01"),
  metadata: { hostOrganizationId: "church", institutionOrganizationId: "can",
    siteId: "church-site", creditIssuingOrganizationId: "can",
    hostSignatureVerified: true, institutionSignatureVerified: true,
    authorizedServices: ["academic_instruction", "onsite_supervision"] },
};
describe("Church-CAN Program-Site authorization policy", () => {
  it("recommends the end-to-end services needed for admissions and classes",()=>{
    const credit=recommendedChurchOperatingServices(true);
    expect(credit).toEqual(expect.arrayContaining([
      "academic_instruction","curriculum","admissions",
      "school_of_record","academic_records","onsite_supervision","credit_issuance",
    ]));
    const noncredit=recommendedChurchOperatingServices(false);
    expect(noncredit).toContain("admissions");
    expect(noncredit).toContain("academic_records");
    expect(noncredit).not.toContain("credit_issuance");
  });
  it("requires different legal institutions and correct church site ownership", () => {
    expect(() => assertChurchCANOperatingIdentity(identity)).not.toThrow();
    expect(() => assertChurchCANOperatingIdentity({ ...identity, siteOrganizationId: "other-church" })).toThrow();
    expect(() => assertChurchCANOperatingIdentity({ ...identity, institutionOrganizationId: "church" })).toThrow();
    expect(() => assertChurchCANOperatingIdentity({
      ...identity, creditIssuingOrganizationId: "unrelated-issuer",
    })).toThrow();
  });
  it("rejects fake/duplicate service scopes", () => {
    expect(normalizeOperatingServices(["onsite_supervision", "academic_instruction"]))
      .toEqual(["academic_instruction", "onsite_supervision"]);
    expect(() => normalizeOperatingServices(["admin.manage"])).toThrow();
    expect(() => normalizeOperatingServices(["academic_instruction","academic_instruction"])).toThrow();
  });
  it("requires independently verified evidence and two-party signoff", () => {
    expect(() => assertOperatingAgreementEvidence(document,identity,[...approval.services],
      "church-requester","can-reviewer",approval.effectiveThrough,now)).not.toThrow();
    for (const changed of [
      { ...document, verifiedByPersonId: "can-reviewer" },
      { ...document, expiresAt: new Date("2026-11-01") },
      { ...document, metadata: { ...document.metadata, hostSignatureVerified: false } },
      { ...document, metadata: { ...document.metadata, siteId: "other" } },
      { ...document, metadata: { ...document.metadata, creditIssuingOrganizationId: "unrelated" } },
    ]) expect(() => assertOperatingAgreementEvidence(changed,identity,[...approval.services],
      "church-requester","can-reviewer",approval.effectiveThrough,now)).toThrow();
  });
  it("blocks revoked/expired/unapproved/wrong-site service entitlements", () => {
    const s = [...approval.services];
    expect(() => assertCurrentOperatingAuthorization({ ...approval, services:s },identity,s,now)).not.toThrow();
    for (const altered of [
      { status: "requested" }, { revokedAt: now }, { effectiveThrough: now },
      { siteId: "other" }, { reviewedByPersonId: "church-requester" },
    ]) expect(() => assertCurrentOperatingAuthorization({ ...approval,services:s,...altered },identity,s,now)).toThrow();
    expect(() => assertCurrentOperatingAuthorization({ ...approval,services:s },
      identity,["academic_records"],now)).toThrow();
    expect(() => assertCurrentOperatingAuthorization({ ...approval,services:s },
      identity,[],now)).toThrow();
    expect(() => assertCurrentOperatingAuthorization({ ...approval,services:["unrecognized"] as never },
      identity,["academic_instruction"],now)).toThrow();
  });
});
