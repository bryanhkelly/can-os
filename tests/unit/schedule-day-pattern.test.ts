import { describe, expect, it } from "vitest";
import { defaultScheduleDayPattern, scheduleDayPattern } from "../../src/domain/schedule-day-pattern";

describe("reviewed instructional schedule pattern", () => {
  it("accepts the standard day and Sunday instruction", () => {
    expect(scheduleDayPattern.safeParse(defaultScheduleDayPattern).success).toBe(true);
    expect(scheduleDayPattern.safeParse({ ...defaultScheduleDayPattern, weekdays: [0, 6] }).success).toBe(true);
  });
  it.each([
    { weekdays: [] }, { weekdays: [1, 1] }, { weekdays: [7] },
    { startsAtLocal: "25:00" }, { endsAtLocal: "08:30" }, { endsAtLocal: "08:00" },
  ])("rejects invalid reviewed choices: %o", changes => {
    expect(scheduleDayPattern.safeParse({ ...defaultScheduleDayPattern, ...changes }).success).toBe(false);
  });
});
