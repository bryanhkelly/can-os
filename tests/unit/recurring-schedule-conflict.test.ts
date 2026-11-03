import { describe, expect, it } from "vitest";
import { recurringSchedulesConflict } from "@/domain/recurring-schedule-conflict";

const window = {
  from: new Date("2026-03-01T00:00:00.000Z"),
  through: new Date("2026-03-14T23:59:59.000Z"),
};

function schedule(timezone: string, dayOfWeek: number, startsAtLocal: string, endsAtLocal: string) {
  return { timezone, periods: [{ dayOfWeek, startsAtLocal, endsAtLocal }] };
}

describe("recurring schedule conflicts", () => {
  it("detects overlapping periods within one timezone", () => {
    expect(recurringSchedulesConflict(
      schedule("America/Los_Angeles", 1, "09:00:00", "10:00:00"),
      schedule("America/Los_Angeles", 1, "09:30:00", "10:30:00"),
      window.from,
      window.through,
    )).toBe(true);
  });

  it("compares actual instants across school timezones", () => {
    expect(recurringSchedulesConflict(
      schedule("America/Los_Angeles", 1, "09:00:00", "11:00:00"),
      schedule("America/New_York", 1, "12:00:00", "14:00:00"),
      window.from,
      window.through,
    )).toBe(true);
    expect(recurringSchedulesConflict(
      schedule("America/Los_Angeles", 1, "09:00:00", "10:00:00"),
      schedule("America/New_York", 1, "09:00:00", "10:00:00"),
      window.from,
      window.through,
    )).toBe(false);
  });

  it("does not treat adjacent periods as conflicts", () => {
    expect(recurringSchedulesConflict(
      schedule("America/Los_Angeles", 1, "09:00:00", "10:00:00"),
      schedule("America/Los_Angeles", 1, "10:00:00", "11:00:00"),
      window.from,
      window.through,
    )).toBe(false);
  });
});
