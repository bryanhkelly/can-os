import { describe, expect, it } from "vitest";
import { boundedCanonicalActiveMs, canonicalLearningEventSchema, learningSessionIsExpired, validateLearningEventTime } from "@/domain/canonical-learning-activity";
const now = new Date("2026-11-14T18:00:00.000Z");
const event = {
  clientEventId: "7a567507-8395-481c-a88b-4a3bc60fbf08",
  kind: "engaged_interval" as const,
  lessonId: "dd52e3ae-d36b-4f9e-91b1-3153703c434b",
  resourceId: null,
  occurredAt: now.toISOString(),
  durationMs: 60_000,
  pageVisible: true,
  windowFocused: true,
};
describe("canonical learning activity", () => {
  it("requires a foreground lesson for an engaged interval", () => {
    expect(canonicalLearningEventSchema.safeParse(event).success).toBe(true);
    expect(canonicalLearningEventSchema.safeParse({ ...event, pageVisible: false }).success).toBe(false);
    expect(canonicalLearningEventSchema.safeParse({ ...event, durationMs: 600_000 }).success).toBe(false);
    expect(canonicalLearningEventSchema.safeParse({ ...event, actorPersonId: "forged" }).success).toBe(false);
  });
  it("does not measure time across idle, hidden or different lessons", () => {
    const previousReceivedAt = new Date(now.getTime()-35_000);
    expect(boundedCanonicalActiveMs({event,previousReceivedAt,now,previousForeground:true,sameLesson:true})).toBe(35_000);
    expect(boundedCanonicalActiveMs({event,previousReceivedAt,now,previousForeground:false,sameLesson:true})).toBe(0);
    expect(boundedCanonicalActiveMs({event,previousReceivedAt,now,previousForeground:true,sameLesson:false})).toBe(0);
    expect(boundedCanonicalActiveMs({event,previousReceivedAt:new Date(now.getTime()-95_000),now,previousForeground:true,sameLesson:true})).toBe(0);
  });
  it("limits timestamps and session age", () => {
    expect(() => validateLearningEventTime(new Date(now.getTime()-360_000).toISOString(), now)).toThrow();
    expect(() => validateLearningEventTime(new Date(now.getTime()+20_000).toISOString(), now)).toThrow();
    expect(learningSessionIsExpired(new Date(now.getTime()-20_000),null,now)).toBe(false);
    expect(learningSessionIsExpired(new Date(now.getTime()-13*3600_000),null,now)).toBe(true);
    expect(learningSessionIsExpired(new Date(now.getTime()-3600_000),new Date(now.getTime()-31*60_000),now)).toBe(true);
  });
});
