import { z } from "zod";
import { estimateActiveLearningMilliseconds } from "./learning-activity-policy";

export const canonicalLearningEventSchema = z.object({
  clientEventId: z.string().uuid(),
  kind: z.enum([
    "lesson_opened", "lesson_resumed", "resource_opened",
    "video_opened", "video_played", "video_ended", "engaged_interval",
  ]),
  lessonId: z.string().uuid().nullable(),
  resourceId: z.string().min(1).max(160).regex(/^[a-zA-Z0-9_./:-]+$/).nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().min(1).max(60_000).optional(),
  pageVisible: z.boolean().optional(),
  windowFocused: z.boolean().optional(),
}).strict().superRefine((event, ctx) => {
  if (event.kind === "engaged_interval" &&
      (!event.durationMs || event.pageVisible !== true || event.windowFocused !== true || !event.lessonId))
    ctx.addIssue({ code: "custom", message: "Engaged intervals require a visible, focused lesson and bounded duration." });
  if (event.kind !== "engaged_interval" &&
      (event.durationMs !== undefined || event.pageVisible !== undefined || event.windowFocused !== undefined))
    ctx.addIssue({ code: "custom", message: "Only engaged intervals may report time or visibility." });
  if ((event.kind === "resource_opened" || event.kind.startsWith("video_")) && !event.resourceId)
    ctx.addIssue({ code: "custom", message: "A resource reference is required." });
  if ((event.kind.startsWith("lesson_") || event.kind.startsWith("video_") || event.kind === "resource_opened") && !event.lessonId)
    ctx.addIssue({ code: "custom", message: "A lesson reference is required." });
});
export type CanonicalLearningEvent = z.infer<typeof canonicalLearningEventSchema>;
export const LEARNING_SESSION_IDLE_MS = 30 * 60_000;
export const LEARNING_SESSION_MAX_MS = 12 * 60 * 60_000;
export function learningSessionIsExpired(startedAt: Date, lastInteractionAt: Date | null, now: Date): boolean {
  return now.getTime() - startedAt.getTime() > LEARNING_SESSION_MAX_MS ||
    now.getTime() - (lastInteractionAt ?? startedAt).getTime() > LEARNING_SESSION_IDLE_MS;
}
export function validateLearningEventTime(occurredAt: string, now: Date): void {
  const skew = now.getTime() - Date.parse(occurredAt);
  if (!Number.isFinite(skew) || skew > 5 * 60_000 || skew < -15_000)
    throw new Error("Learning activity timestamp outside allowed window");
}
export function boundedCanonicalActiveMs(input: {
  event: CanonicalLearningEvent;
  previousReceivedAt: Date | null;
  now: Date;
  previousForeground: boolean;
  sameLesson: boolean;
}): number {
  if (input.event.kind !== "engaged_interval" || !input.sameLesson) return 0;
  return estimateActiveLearningMilliseconds({
    previousReceivedAt: input.previousReceivedAt,
    receivedAt: input.now,
    reportedDurationMs: input.event.durationMs ?? 0,
    previousForeground: input.previousForeground,
    currentForeground: input.event.pageVisible === true && input.event.windowFocused === true,
  });
}
