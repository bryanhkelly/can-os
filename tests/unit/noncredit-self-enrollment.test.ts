import { describe, expect, it } from "vitest";
import {
  assertCanSelfEnroll, noncreditEnrollCommand, noncreditPublishCommand,
  publishedNoncreditConsentHash, noncreditSelfWithdrawalDecision,
} from "@/domain/noncredit-self-enrollment";

const releaseId = "11111111-1111-4111-8111-111111111111";
const adoptionId = "22222222-2222-4222-8222-222222222222";
const trainingId = "33333333-3333-4333-8333-333333333333";
const courseId = "44444444-4444-4444-8444-444444444444";

const publication = {
  deploymentId: releaseId,
  adoptionId,
  trainingVersionId: trainingId,
  courseVersionId: courseId,
  deliveryMode: "independent" as const,
  siteId: null,
  opensAt: "2026-11-14T18:00:00Z",
  closesAt: "2026-12-14T18:00:00Z",
  maxParticipants: 100,
  consentVersion: "noncredit-pilot-v1",
  consentText: "I consent to this training and its specified participation records.",
};

const eligible = {
  isAuthenticated: true, emailVerified: true, demoSwitching: false,
  distinctPersonCount: 1, isStudent: false, consentMatches: true,
  adultConfirmed: true, published: true, activeDeployment: true,
  activeOperation: true, approvedAdoption: true, publishedCourse: true,
  publishedOffering: true, publishedTraining: true, approvedTraining: true,
  currentPolicy: true, remainingSeats: 1,
};

describe("Noncredit adult self-enrollment authority", () => {
  it("publishes only bounded windows and valid facilitated Site choices", () => {
    expect(noncreditPublishCommand.parse(publication).deliveryMode).toBe("independent");
    expect(noncreditPublishCommand.safeParse({
      ...publication, deliveryMode: "facilitated",
    }).success).toBe(false);
    expect(noncreditPublishCommand.safeParse({
      ...publication, deliveryMode: "facilitated", siteId: adoptionId,
    }).success).toBe(true);
    expect(noncreditPublishCommand.safeParse({
      ...publication, deliveryMode: "independent", siteId: adoptionId,
    }).success).toBe(false);
    expect(noncreditPublishCommand.safeParse({
      ...publication, closesAt: "2026-11-01T18:00:00Z",
    }).success).toBe(false);
    expect(noncreditPublishCommand.safeParse({
      ...publication, maxParticipants: 0,
    }).success).toBe(false);
  });
  it("ties an explicit adult acceptance to the immutable published terms", () => {
    const hash = publishedNoncreditConsentHash(
      publication.consentVersion, publication.consentText,
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(publishedNoncreditConsentHash(
      publication.consentVersion, publication.consentText + " changed",
    ));
    const valid = {
      releaseId, consentVersion: publication.consentVersion,
      consentSha256: hash, acceptedConsent: true as const,
      adultConfirmed: true as const,
    };
    expect(noncreditEnrollCommand.safeParse(valid).success).toBe(true);
    expect(noncreditEnrollCommand.safeParse({
      ...valid, acceptedConsent: false,
    }).success).toBe(false);
    expect(noncreditEnrollCommand.safeParse({
      ...valid, adultConfirmed: false,
    }).success).toBe(false);
    expect(noncreditEnrollCommand.safeParse({
      ...valid, participantPersonId: adoptionId,
    }).success).toBe(false);
    expect(noncreditEnrollCommand.safeParse({
      ...valid, referralCode: "alpha!unsafe",
    }).success).toBe(false);
  });
  it("fails closed for unverified identity, student roles and stale release", () => {
    expect(() => assertCanSelfEnroll(eligible)).not.toThrow();
    for (const change of [
      {isAuthenticated:false}, {emailVerified:false}, {demoSwitching:true},
      {distinctPersonCount:2}, {isStudent:true}, {consentMatches:false},
      {adultConfirmed:false}, {published:false}, {activeDeployment:false},
      {activeOperation:false}, {approvedAdoption:false}, {publishedCourse:false},
      {publishedOffering:false}, {publishedTraining:false},
      {approvedTraining:false}, {currentPolicy:false}, {remainingSeats:0},
    ]) {
      expect(() => assertCanSelfEnroll({...eligible,...change})).toThrow();
    }
  });
  it("does not withdraw completed training or silently release the seat", () => {
    expect(noncreditSelfWithdrawalDecision({
      registrationStatus:"registered",hasCompletedAttempt:false,hasCompletedDecision:false,
    })).toBe("withdraw");
    expect(noncreditSelfWithdrawalDecision({
      registrationStatus:"active",hasCompletedAttempt:false,hasCompletedDecision:false,
    })).toBe("withdraw");
    expect(noncreditSelfWithdrawalDecision({
      registrationStatus:"withdrawn",hasCompletedAttempt:false,hasCompletedDecision:false,
    })).toBe("already_withdrawn");
    expect(noncreditSelfWithdrawalDecision({
      registrationStatus:"completed",hasCompletedAttempt:false,hasCompletedDecision:false,
    })).toBe("deny");
    expect(noncreditSelfWithdrawalDecision({
      registrationStatus:"cancelled",hasCompletedAttempt:false,hasCompletedDecision:false,
    })).toBe("deny");
    expect(noncreditSelfWithdrawalDecision({
      registrationStatus:"active",hasCompletedAttempt:true,hasCompletedDecision:false,
    })).toBe("deny");
    expect(noncreditSelfWithdrawalDecision({
      registrationStatus:"registered",hasCompletedAttempt:false,hasCompletedDecision:true,
    })).toBe("deny");
  });
});
