import { describe, expect, it } from "vitest";
import { currentChurchAuthorityEvidence, evidenceExpiresAt, validateChurchEvidenceReference } from "../../src/modules/networks/church-evidence-policy";

const when = new Date("2026-10-31T19:00:00Z");
const request = { id: "request-a", churchSlug: "church-a", contactEmail: "leader@example.org", verifiedByPersonId: "verifier" };
const evidence = {
  category: "church_onboarding_authority",
  verifiedAt: new Date(when.getTime() - 3600000),
  verifiedByPersonId: "verifier",
  expiresAt: evidenceExpiresAt(when),
  metadata: { provenance: "can_steward_independently_reviewed", churchRequestId: "request-a", churchSlug: "church-a", authorizedEmailNormalized: "leader@example.org" },
};

describe("church authority evidence policy", () => {
  it("accepts an application-bound reference for a different CAN approver", () => {
    expect(currentChurchAuthorityEvidence(evidence, request, "approver", when)).toBe(true);
  });
  it("rejects applicant-declared or missing independent review provenance", () => {
    expect(currentChurchAuthorityEvidence({ ...evidence, metadata: { ...evidence.metadata, provenance: "applicant_declared" } }, request, "approver", when)).toBe(false);
    expect(currentChurchAuthorityEvidence({ ...evidence, metadata: { churchRequestId: request.id } }, request, "approver", when)).toBe(false);
  });
  it("rejects approval by the verifying steward", () => {
    expect(currentChurchAuthorityEvidence(evidence, request, "verifier", when)).toBe(false);
  });
  it("rejects evidence reused by a second church or a different request", () => {
    expect(currentChurchAuthorityEvidence(evidence, { ...request, id: "request-b" }, "approver", when)).toBe(false);
    expect(currentChurchAuthorityEvidence(evidence, { ...request, churchSlug: "church-b" }, "approver", when)).toBe(false);
  });
  it("rejects expired and unbounded references", () => {
    expect(currentChurchAuthorityEvidence({ ...evidence, expiresAt: when }, request, "approver", when)).toBe(false);
    expect(currentChurchAuthorityEvidence({ ...evidence, expiresAt: null }, request, "approver", when)).toBe(false);
  });
  it("rejects unverified evidence, canceled evidence and mismatched contacts", () => {
    expect(currentChurchAuthorityEvidence({ ...evidence, verifiedAt: null }, request, "approver", when)).toBe(false);
    expect(currentChurchAuthorityEvidence({ ...evidence, category: "revoked" }, request, "approver", when)).toBe(false);
    expect(currentChurchAuthorityEvidence(evidence, { ...request, contactEmail: "other@example.org" }, "approver", when)).toBe(false);
  });
  it("rejects malicious attachment-style references and embedded credentials", () => {
    for (const ref of ["javascript:alert(1)", "data:text/html,malicious", "file:///etc/passwd",
      "https://user:secret@example.com/record", "http://example.com/record", "vault:record\nheader"]) {
      expect(() => validateChurchEvidenceReference(ref, "signed_authority")).toThrow();
    }
  });
  it("allows an internal vault reference but rejects uninspected HTTPS pointers", () => {
    expect(validateChurchEvidenceReference("vault:church-a/authority", "signed_authority")).toBe("vault:church-a/authority");
    expect(() => validateChurchEvidenceReference("https://records.example.org/authority/123", "denominational_confirmation")).toThrow();
  });
  it("rejects untraceable free-text and unsupported reference schemes", () => {
    for (const ref of ["meeting notes from yesterday", "ftp://example.org/evidence", "s3://unapproved-bucket/evidence"]) {
      expect(() => validateChurchEvidenceReference(ref, "signed_authority")).toThrow();
    }
  });
  it("rejects unsupported verification methods", () => {
    expect(() => validateChurchEvidenceReference("vault:church-a/authority", "applicant_self_attestation")).toThrow();
  });
});
