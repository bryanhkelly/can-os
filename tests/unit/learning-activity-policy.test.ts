import { describe, expect, it } from "vitest";
import {
  estimateActiveLearningMilliseconds,
  learnerInteractionInputSchema,
  parseLearnerInteraction,
} from "@/domain/learning-activity-policy";

const now = new Date("2026-10-22T16:00:00.000Z");
const lessonEvent = {
  clientEventId: "11111111-1111-4111-8111-111111111111",
  sectionId: "22222222-2222-4222-8222-222222222222",
  lessonId: "lesson-1",
  occurredAt: "2026-10-22T15:59:45.000Z",
  kind: "lesson_opened" as const,
};

describe("learning interaction evidence boundary", () => {
  it("accepts a bounded lesson event without assigning a student or school role", () => {
    expect(parseLearnerInteraction(lessonEvent, now)).toEqual(lessonEvent);
    expect(learnerInteractionInputSchema.options.map(option => option.shape.kind.value)).toEqual([
      "lesson_opened", "lesson_resumed", "resource_opened", "engaged_interval",
    ]);
  });

  it("rejects identity forgery, grades, attendance and extra uncontrolled payloads", () => {
    for (const extra of [
      { studentProfileId: "someone-else" },
      { actorPersonId: "someone-else" },
      { attendanceStatus: "present" },
      { grade: 100 },
      { metadata: { notes: "unbounded" } },
    ]) {
      expect(() => parseLearnerInteraction({ ...lessonEvent, ...extra }, now)).toThrow();
    }
    expect(() => parseLearnerInteraction({ ...lessonEvent, kind: "lesson_completed" }, now)).toThrow();
    expect(() => parseLearnerInteraction({ ...lessonEvent, kind: "grade_posted" }, now)).toThrow();
  });

  it("allows resource references only in the correctly typed event", () => {
    const resourceId = "33333333-3333-4333-8333-333333333333";
    expect(parseLearnerInteraction({ ...lessonEvent, kind: "resource_opened", resourceId }, now)).toMatchObject({ resourceId });
    expect(() => parseLearnerInteraction({ ...lessonEvent, resourceId }, now)).toThrow();
  });

  it("accepts published resource keys but rejects free-form or hostile identifiers", () => {
    expect(parseLearnerInteraction({
      ...lessonEvent, kind: "resource_opened", resourceId: "lesson-reading_01",
    }, now)).toMatchObject({ kind: "resource_opened", resourceId: "lesson-reading_01" });
    for (const resourceId of ["", "../another-lesson", "http://unknown", "<script>", "a".repeat(101)]) {
      expect(() => parseLearnerInteraction({
        ...lessonEvent, kind: "resource_opened", resourceId,
      }, now)).toThrow();
    }
    // Only resource_opened may carry the resource ID.
    expect(() => parseLearnerInteraction({
      ...lessonEvent, kind: "engaged_interval", resourceId: "lesson-reading_01",
      durationMs: 5_000, pageVisible: true, windowFocused: true,
    }, now)).toThrow();
  });

  it("rejects replay outside the live telemetry window and future-timestamp inflation", () => {
    expect(() => parseLearnerInteraction({ ...lessonEvent, occurredAt: "2026-10-22T15:50:00Z" }, now)).toThrow();
    expect(() => parseLearnerInteraction({ ...lessonEvent, occurredAt: "2026-10-22T16:00:16Z" }, now)).toThrow();
    expect(() => parseLearnerInteraction({ ...lessonEvent, occurredAt: "2026-10-22T16:00:15Z" }, now)).not.toThrow();
  });

  it("does not accept a client assertion of background activity or an unbounded duration", () => {
    const interval = { ...lessonEvent, kind: "engaged_interval", durationMs: 30_000, pageVisible: true, windowFocused: true };
    expect(parseLearnerInteraction(interval, now)).toEqual(interval);
    expect(() => parseLearnerInteraction({ ...interval, pageVisible: false }, now)).toThrow();
    expect(() => parseLearnerInteraction({ ...interval, windowFocused: false }, now)).toThrow();
    expect(() => parseLearnerInteraction({ ...interval, durationMs: 60_001 }, now)).toThrow();
    expect(() => parseLearnerInteraction({ ...interval, durationMs: -1 }, now)).toThrow();
  });
});

describe("estimated active learning is not login time or attendance", () => {
  const base = {
    previousReceivedAt: new Date("2026-10-22T16:00:00Z"),
    receivedAt: new Date("2026-10-22T16:00:30Z"),
    reportedDurationMs: 30_000,
    previousForeground: true,
    currentForeground: true,
  };

  it("never credits more time than observed by the server", () => {
    expect(estimateActiveLearningMilliseconds(base)).toBe(30_000);
    expect(estimateActiveLearningMilliseconds({ ...base, reportedDurationMs: 60_000 })).toBe(30_000);
    expect(estimateActiveLearningMilliseconds({
      ...base, receivedAt: new Date("2026-10-22T16:01:15Z"), reportedDurationMs: 75_000,
    })).toBe(0); // invalid client duration
    expect(estimateActiveLearningMilliseconds({
      ...base, receivedAt: new Date("2026-10-22T16:01:15Z"), reportedDurationMs: 60_000,
    })).toBe(60_000);
  });

  it("rejects single clicks, idle gaps, disconnects, hidden or unfocused intervals", () => {
    expect(estimateActiveLearningMilliseconds({ ...base, previousReceivedAt: null })).toBe(0);
    expect(estimateActiveLearningMilliseconds({ ...base, previousForeground: false })).toBe(0);
    expect(estimateActiveLearningMilliseconds({ ...base, currentForeground: false })).toBe(0);
    expect(estimateActiveLearningMilliseconds({ ...base, receivedAt: new Date("2026-10-22T16:02:00Z") })).toBe(0);
    expect(estimateActiveLearningMilliseconds({ ...base, receivedAt: new Date("2026-10-22T15:59:59Z") })).toBe(0);
    expect(estimateActiveLearningMilliseconds({ ...base, reportedDurationMs: Number.NaN })).toBe(0);
  });
});
