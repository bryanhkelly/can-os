import { describe, expect, it } from "vitest";
import {
  canPairFacilitatedLearning, facilitatedPairSchema, facilitatedPlaybackSchema,
  normalizeFacilitatedPairingCode,
} from "@/domain/facilitated-learning";

const now = new Date("2026-11-14T19:00:00Z");
const version = "a2222222-2222-4222-8222-222222222222";
const deployment = "b3333333-3333-4333-8333-333333333333";
const baseline = {
  sessionState: "live" as const,
  startedAt: new Date(now.getTime() - 30 * 60_000),
  pairingExpiresAt: new Date(now.getTime() + 2 * 60_000),
  now, sessionDeploymentId: deployment, sessionCourseVersionId: version,
  attemptDeploymentId: deployment, attemptCourseVersionId: version,
};

describe("facilitated classroom pairing", () => {
  it("normalizes only high-entropy unambiguous pairing codes", () => {
    expect(normalizeFacilitatedPairingCode("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(() => normalizeFacilitatedPairingCode("0000000000")).toThrow();
    expect(() => normalizeFacilitatedPairingCode("ABCDEFGHJI")).toThrow();
    expect(() => normalizeFacilitatedPairingCode("ABCDE")).toThrow();
  });
  it("rejects cross-deployment, wrong course, expired code and ended room", () => {
    expect(canPairFacilitatedLearning(baseline)).toBe(true);
    expect(canPairFacilitatedLearning({...baseline,attemptDeploymentId:"other"})).toBe(false);
    expect(canPairFacilitatedLearning({...baseline,attemptCourseVersionId:"other"})).toBe(false);
    expect(canPairFacilitatedLearning({...baseline,sessionState:"ended"})).toBe(false);
    expect(canPairFacilitatedLearning({...baseline,pairingExpiresAt:now})).toBe(false);
    expect(canPairFacilitatedLearning({...baseline,startedAt:new Date(now.getTime() - 9*3600_000)})).toBe(false);
  });
  it("forbids arbitrary student identity and playback position abuse", () => {
    expect(facilitatedPairSchema.safeParse({
      courseAttemptId:version,pairingCode:"ABCDE-FGHJK",
      participantPersonId:deployment,
    }).success).toBe(false);
    const action={
      facilitatedSessionId:deployment,requestId:version,
      lessonId:version,assetVersionId:version,
      kind:"played",positionSeconds:30,
    };
    expect(facilitatedPlaybackSchema.safeParse(action).success).toBe(true);
    expect(facilitatedPlaybackSchema.safeParse({...action,positionSeconds:-5}).success).toBe(false);
    expect(facilitatedPlaybackSchema.safeParse({...action,positionSeconds:100000}).success).toBe(false);
  });
});
