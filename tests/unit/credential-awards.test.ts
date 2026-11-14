import { describe, expect, it } from "vitest";
import { credentialIsCurrent, evaluateAchievementAward } from "@/domain/credential-awards";

const completed = {
  kind: "noncredit_completion" as const,
  participantPersonId: "person-1",
  providerOrganizationId: "provider-1",
  decisionId: "decision-1",
  latestOutcome: "completed" as const,
  isCurrentDecision: true,
};
const base = {
  definitionPublished: true,
  issuerOrganizationId: "provider-1",
  recipientPersonId: "person-1",
  source: completed,
};

describe("credential achievement boundary", () => {
  it("allows an authorized latest noncredit completion without granting academic credit", () => {
    expect(evaluateAchievementAward(base)).toEqual({ eligible: true, blockers: [] });
  });
  it("refuses a prior, voided or another provider's completion", () => {
    expect(evaluateAchievementAward({ ...base, source: { ...completed, isCurrentDecision: false } }).blockers)
      .toContain("source_incomplete");
    expect(evaluateAchievementAward({ ...base, source: { ...completed, latestOutcome: "voided" } }).blockers)
      .toContain("source_incomplete");
    expect(evaluateAchievementAward({ ...base, issuerOrganizationId: "other-provider" }).blockers)
      .toContain("issuer_mismatch");
    expect(evaluateAchievementAward({ ...base, recipientPersonId: "other-person" }).blockers)
      .toContain("learner_mismatch");
    expect(evaluateAchievementAward({ ...base, definitionPublished: false }).blockers)
      .toContain("definition_unpublished");
  });
  it("requires independently verified activity evidence and minimum attendance", () => {
    const activity = {
      kind: "verified_activity" as const,
      participantPersonId: "person-1", providerOrganizationId: "provider-1",
      evidenceVersionId: "evidence-1", verifiedByPersonId: "staff-1",
      registrationActive: true, verifiedMinutes: 120, minimumMinutes: 120,
    };
    expect(evaluateAchievementAward({ ...base, source: activity }).eligible).toBe(true);
    expect(evaluateAchievementAward({ ...base, source: { ...activity, verifiedMinutes: 119 } }).blockers)
      .toContain("source_incomplete");
    expect(evaluateAchievementAward({ ...base, source: { ...activity, verifiedByPersonId: "person-1" } }).blockers)
      .toContain("evidence_unverified");
    expect(evaluateAchievementAward({ ...base, source: { ...activity, evidenceVersionId: null } }).blockers)
      .toContain("evidence_unverified");
    expect(evaluateAchievementAward({ ...base, source: { ...activity, registrationActive: false } }).blockers)
      .toContain("source_incomplete");
  });
  it("does not treat an old image or PDF as proof a credential is still valid", () => {
    const state = { issued: true, revoked: false, sourceStillValid: true,
      expiresAt: new Date("2027-01-01"), now: new Date("2026-11-14") };
    expect(credentialIsCurrent(state)).toBe(true);
    expect(credentialIsCurrent({ ...state, revoked: true })).toBe(false);
    expect(credentialIsCurrent({ ...state, sourceStillValid: false })).toBe(false);
    expect(credentialIsCurrent({ ...state, legacyCertificateRevoked: true })).toBe(false);
    expect(credentialIsCurrent({ ...state, now: new Date("2027-01-01") })).toBe(false);
    expect(credentialIsCurrent({ ...state, expiresAt: new Date("invalid") })).toBe(false);
    expect(credentialIsCurrent({ ...state, expiresAt: new Date("2026-11-13") })).toBe(false);
  });
});
