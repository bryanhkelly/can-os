import { z } from "zod";

export const facilitatedCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const facilitatedCodeLength = 10;
export const facilitatedPairingWindowMs = 15 * 60_000;
export const facilitatedRoomMaxMs = 8 * 60 * 60_000;

export const facilitatedStartSchema = z.object({
  deploymentId: z.string().uuid(),
  courseVersionId: z.string().uuid(),
  siteId: z.string().uuid(),
}).strict();

export const facilitatedPairSchema = z.object({
  courseAttemptId: z.string().uuid(),
  pairingCode: z.string().trim().min(10).max(11),
}).strict();

export const facilitatedPlaybackSchema = z.object({
  facilitatedSessionId: z.string().uuid(),
  requestId: z.string().uuid(),
  lessonId: z.string().uuid(),
  assetVersionId: z.string().uuid(),
  kind: z.enum(["opened", "played", "paused", "ended"]),
  positionSeconds: z.number().int().min(0).max(43200).nullable(),
}).strict();

export function normalizeFacilitatedPairingCode(raw: string): string {
  const code = raw.replaceAll("-", "").replaceAll(" ", "").toUpperCase();
  if (code.length !== facilitatedCodeLength ||
      [...code].some(char => !facilitatedCodeAlphabet.includes(char))) {
    throw new Error("Invalid pairing code");
  }
  return code;
}

export function canPairFacilitatedLearning(input: {
  sessionState: "live" | "ended";
  startedAt: Date;
  pairingExpiresAt: Date;
  now: Date;
  sessionDeploymentId: string;
  sessionCourseVersionId: string;
  attemptDeploymentId: string;
  attemptCourseVersionId: string;
}): boolean {
  return input.sessionState === "live" &&
    input.startedAt <= input.now &&
    input.now.getTime() - input.startedAt.getTime() <= facilitatedRoomMaxMs &&
    input.pairingExpiresAt > input.now &&
    input.sessionDeploymentId === input.attemptDeploymentId &&
    input.sessionCourseVersionId === input.attemptCourseVersionId;
}


export const MAX_PAIRING_ATTEMPTS = 6;
export const PAIRING_RATE_WINDOW_MS = 15 * 60_000;

/**
 * Fixed per-Person attempt window. Persist the denied 7th attempt and its lock
 * before returning a generic denial. Avoid storing guessed pairing codes.
 */
export function nextFacilitatedPairingLimit(input:{
  attempts:number;
  windowStartedAt:Date;
  blockedUntil:Date|null;
  now:Date;
}):{allowed:boolean;attempts:number;windowStartedAt:Date;blockedUntil:Date|null}{
  if(input.blockedUntil && input.blockedUntil>input.now)
    return {allowed:false,attempts:input.attempts,
      windowStartedAt:input.windowStartedAt,blockedUntil:input.blockedUntil};
  const newWindow=input.now.getTime()-input.windowStartedAt.getTime()>=PAIRING_RATE_WINDOW_MS;
  const count=newWindow?1:Math.min(MAX_PAIRING_ATTEMPTS+1,input.attempts+1);
  const allowed=count<=MAX_PAIRING_ATTEMPTS;
  return {
    allowed,attempts:count,
    windowStartedAt:newWindow?input.now:input.windowStartedAt,
    blockedUntil:allowed?null:new Date(input.now.getTime()+PAIRING_RATE_WINDOW_MS),
  };
}
