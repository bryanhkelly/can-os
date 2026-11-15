import { describe, expect, it } from "vitest";
import {
  canPairFacilitatedLearning, facilitatedPairSchema, facilitatedPlaybackSchema,
  normalizeFacilitatedPairingCode,nextFacilitatedPairingLimit,
  facilitatedRoomOperationalState, facilitatedRoomMaxMs, roomMediaAudienceEligible,
} from "@/domain/facilitated-learning";
import { classroomFeedbackClosesAt, classroomFeedbackOpen } from "@/domain/classroom-feedback";

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
  it("expires room controls exactly eight hours after start", () => {
    const startedAt = new Date(now.getTime() - facilitatedRoomMaxMs);
    const room = { state: "live" as const, startedAt, endedAt: null };
    expect(facilitatedRoomOperationalState(room,
      new Date(now.getTime() - 1))).toBe("live");
    expect(facilitatedRoomOperationalState(room, now)).toBe("expired");
    expect(canPairFacilitatedLearning({
      ...baseline, startedAt, pairingExpiresAt: new Date(now.getTime() + 60_000),
    })).toBe(false);
    expect(facilitatedRoomOperationalState({
      ...room, state: "ended", endedAt: new Date(now.getTime() - 60_000),
    }, now)).toBe("ended");
    expect(facilitatedRoomOperationalState({
      ...room, startedAt: new Date(now.getTime() + 1),
    }, now)).toBe("expired");
  });
  it("requires a valid current same-Site audience for school media", () => {
    const audience = {
      roomDeploymentId: deployment, roomCourseVersionId: version,
      attemptDeploymentId: deployment, attemptCourseVersionId: version,
      attemptStatus: "active", sourceCurrent: true,
      schoolAttempt: true, currentRoomSitePlacement: true,
    };
    expect(roomMediaAudienceEligible(audience)).toBe(true);
    expect(roomMediaAudienceEligible({...audience,currentRoomSitePlacement:false})).toBe(false);
    expect(roomMediaAudienceEligible({...audience,sourceCurrent:false})).toBe(false);
    expect(roomMediaAudienceEligible({...audience,attemptStatus:"withdrawn"})).toBe(false);
    expect(roomMediaAudienceEligible({...audience,attemptDeploymentId:"different"})).toBe(false);
    expect(roomMediaAudienceEligible({...audience,attemptCourseVersionId:"different"})).toBe(false);
    expect(roomMediaAudienceEligible({...audience,schoolAttempt:false,
      currentRoomSitePlacement:false})).toBe(true); // remote noncredit, active registration
  });
  it("keeps subjective room feedback open for seven days without extending the room", () => {
    const startedAt = new Date("2026-11-01T12:00:00.000Z");
    const room = { startedAt, endedAt: null };
    const cutoff = classroomFeedbackClosesAt(room);
    expect(cutoff.toISOString()).toBe("2026-11-08T20:00:00.000Z");
    expect(classroomFeedbackOpen(room, new Date(cutoff.getTime()-1))).toBe(true);
    expect(classroomFeedbackOpen(room, cutoff)).toBe(false);
    const ended = {startedAt, endedAt: new Date("2026-11-01T14:00:00.000Z")};
    expect(classroomFeedbackClosesAt(ended).toISOString()).toBe("2026-11-08T14:00:00.000Z");
    expect(classroomFeedbackOpen(room, new Date(startedAt.getTime()-1))).toBe(false);
  });
  it("locks after six attempts, keeps the counter, then resets after the lock window",()=>{
    const first=nextFacilitatedPairingLimit({
      attempts:0,windowStartedAt:now,blockedUntil:null,now,
    });
    expect(first).toMatchObject({allowed:true,attempts:1,blockedUntil:null});
    const blocked=nextFacilitatedPairingLimit({
      attempts:6,windowStartedAt:now,blockedUntil:null,now,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.attempts).toBe(7);
    const denied=nextFacilitatedPairingLimit({
      attempts:blocked.attempts,windowStartedAt:now,blockedUntil:blocked.blockedUntil,
      now:new Date(now.getTime()+1000),
    });
    expect(denied.allowed).toBe(false);
    const reset=nextFacilitatedPairingLimit({
      attempts:blocked.attempts,windowStartedAt:now,blockedUntil:blocked.blockedUntil,
      now:new Date(now.getTime()+16*60_000),
    });
    expect(reset.allowed).toBe(true);
    expect(reset.attempts).toBe(1);
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
