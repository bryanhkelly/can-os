import { z } from "zod";

/**
 * First incremental input contract for learner interaction evidence.
 *
 * This is NOT authentication, attendance, achievement or a canonical grade.
 * A future persistence command must resolve the student's identity and verify
 * the current section enrollment, content version and session on the server.
 * Client-reported events are never permission or credit evidence by themselves.
 */
const common = {
  clientEventId: z.string().uuid(),
  sectionId: z.string().uuid(),
  lessonId: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
};

export const learnerInteractionInputSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("lesson_opened") }).strict(),
  z.object({ ...common, kind: z.literal("lesson_resumed") }).strict(),
  z.object({
    ...common,
    kind: z.literal("resource_opened"),
    resourceId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  }).strict(),
  z.object({
    ...common,
    kind: z.literal("engaged_interval"),
    durationMs: z.number().int().min(1).max(60_000),
    pageVisible: z.literal(true),
    windowFocused: z.literal(true),
  }).strict(),
]);

export type LearnerInteractionInput = z.infer<typeof learnerInteractionInputSchema>;

export const LEARNING_ACTIVITY_POLICY = Object.freeze({
  maxEventAgeMs: 5 * 60 * 1000,
  maxFutureSkewMs: 15 * 1000,
  maxActiveIntervalMs: 60 * 1000,
  maxIntervalGapMs: 90 * 1000,
});

/**
 * A bounded client event, not a trusted learning outcome.
 * The server must provide now. This rejects old/replayed offline telemetry
 * until explicit offline-attestation support is designed.
 */
export function parseLearnerInteraction(value: unknown, now = new Date()): LearnerInteractionInput {
  const input = learnerInteractionInputSchema.parse(value);
  const occurredAt = Date.parse(input.occurredAt);
  const ageMs = now.getTime() - occurredAt;
  if (!Number.isFinite(ageMs) ||
      ageMs > LEARNING_ACTIVITY_POLICY.maxEventAgeMs ||
      ageMs < -LEARNING_ACTIVITY_POLICY.maxFutureSkewMs) {
    throw new Error("Learning interaction timestamp outside allowed window");
  }
  return input;
}

/**
 * A CONSERVATIVE estimate from two server-observed foreground interactions.
 * One isolated click, hidden/unfocused page, disconnect or idle gap yields 0.
 * Cannot be used to modify attendance, lesson completion, grades or credits.
 *
 * The reported client duration is always bounded by elapsed server time;
 * deduplication and enrollment checks belong to the future persistence command.
 */
export function estimateActiveLearningMilliseconds(input: {
  previousReceivedAt: Date | null;
  receivedAt: Date;
  reportedDurationMs: number;
  previousForeground: boolean;
  currentForeground: boolean;
}): number {
  if (!input.previousForeground || !input.currentForeground ||
      !Number.isSafeInteger(input.reportedDurationMs) ||
      input.reportedDurationMs <= 0 ||
      input.reportedDurationMs > LEARNING_ACTIVITY_POLICY.maxActiveIntervalMs) return 0;
  const intervalMs = input.receivedAt.getTime() - (input.previousReceivedAt?.getTime() ?? NaN);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 ||
      intervalMs > LEARNING_ACTIVITY_POLICY.maxIntervalGapMs) return 0;
  return Math.min(
    input.reportedDurationMs,
    intervalMs,
    LEARNING_ACTIVITY_POLICY.maxActiveIntervalMs,
  );
}
