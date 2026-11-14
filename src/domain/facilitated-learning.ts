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
