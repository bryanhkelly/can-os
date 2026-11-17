import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AuthorizationError } from "@/domain/command-context";
import {
  assertCurrentOperatingAuthorization,
  assertOperatingAgreementEvidence,
  type OperatingProgramIdentity,
} from "@/domain/program-site-operating-policy";

const at = new Date("2026-11-17T12:00:00Z");
const identity: OperatingProgramIdentity = {
  programId: "program-1", programOrganizationId: "church-1",
  siteId: "site-1", siteOrganizationId: "church-1",
  hostOrganizationId: "church-1", hostOrganizationType: "church",
  institutionOrganizationId: "can-1", institutionOrganizationType: "can_network",
  creditIssuingOrganizationId: null,
};
const agreement = {
  status: "approved", programId: "program-1", siteId: "site-1",
  hostOrganizationId: "church-1", institutionOrganizationId: "can-1",
  services: ["academic_instruction", "curriculum"] as ("academic_instruction" | "curriculum")[],
  effectiveFrom: new Date("2026-11-01T00:00:00Z"),
  effectiveThrough: new Date("2026-12-01T00:00:00Z"),
  reviewedAt: new Date("2026-11-02T00:00:00Z"),
  reviewedByPersonId: "reviewer", requestedByPersonId: "requester",
  revokedAt: null,
};
const evidence = {
  subjectType: "program", subjectId: "program-1",
  category: "program_site_operating_agreement",
  verifiedAt: new Date("2026-11-02T00:00:00Z"),
  verifiedByPersonId: "third-party",
  expiresAt: new Date("2027-01-01T00:00:00Z"),
  metadata: {
    hostOrganizationId: "church-1", institutionOrganizationId: "can-1",
    siteId: "site-1", hostSignatureVerified: true,
    institutionSignatureVerified: true,
    authorizedServices: ["academic_instruction", "curriculum"],
  },
};

describe("batched teacher scope preserves strict individual agreement policy", () => {
  it("requires every contracted service and valid independent evidence", () => {
    expect(() => assertCurrentOperatingAuthorization(agreement, identity,
      ["academic_instruction", "curriculum"], at)).not.toThrow();
    expect(() => assertOperatingAgreementEvidence(evidence, identity,
      ["academic_instruction", "curriculum"], "requester", "reviewer",
      agreement.effectiveThrough, at)).not.toThrow();
  });
  it("rejects revoked, expired, mis-scoped, and incomplete agreements", () => {
    for (const invalid of [
      { ...agreement, revokedAt: at },
      { ...agreement, effectiveThrough: at },
      { ...agreement, siteId: "another-site" },
      { ...agreement, services: ["academic_instruction"] as ("academic_instruction" | "curriculum")[] },
    ]) {
      expect(() => assertCurrentOperatingAuthorization(invalid, identity,
        ["academic_instruction", "curriculum"], at)).toThrow(AuthorizationError);
    }
    expect(() => assertOperatingAgreementEvidence({
      ...evidence, metadata: { ...evidence.metadata, institutionSignatureVerified: false },
    }, identity, ["academic_instruction", "curriculum"], "requester", "reviewer",
    agreement.effectiveThrough, at)).toThrow(AuthorizationError);
  });
  it("does not reintroduce per-assignment authorization SQL in session context", () => {
    const context = readFileSync(resolve(process.cwd(),
      "src/modules/identity/command-context.server.ts"), "utf8");
    const batch = readFileSync(resolve(process.cwd(),
      "src/modules/programs/program-site-authorization.server.ts"), "utf8");
    expect(context).toContain("listInstitutionallyAuthorizedAcademicProgramIds(");
    expect(context).not.toContain("await requireInstitutionalAcademicProgramAuthority(");
    expect(batch).toContain("assertCurrentOperatingAuthorization(authorization, identity");
    expect(batch).toContain("assertOperatingAgreementEvidence(evidence, identity");
  });
});
