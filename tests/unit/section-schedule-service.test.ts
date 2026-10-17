import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));

import { meetingPeriodsConflict } from "@/modules/academic-time/section-schedule-service";

describe("section schedule conflicts", () => {
  it("detects overlapping instructional periods on the same day", () => {
    expect(meetingPeriodsConflict(
      [{ dayOfWeek: 2, startsAtLocal: "09:00:00", endsAtLocal: "10:30:00", label: "A" }],
      [{ dayOfWeek: 2, startsAtLocal: "10:00:00", endsAtLocal: "11:00:00", label: "B" }],
    )).toBe(true);
  });

  it("allows adjacent or different-day periods", () => {
    expect(meetingPeriodsConflict(
      [{ dayOfWeek: 2, startsAtLocal: "09:00:00", endsAtLocal: "10:00:00", label: "A" }],
      [{ dayOfWeek: 2, startsAtLocal: "10:00:00", endsAtLocal: "11:00:00", label: "B" }],
    )).toBe(false);
    expect(meetingPeriodsConflict(
      [{ dayOfWeek: 2, startsAtLocal: "09:00:00", endsAtLocal: "10:00:00", label: "A" }],
      [{ dayOfWeek: 4, startsAtLocal: "09:00:00", endsAtLocal: "10:00:00", label: "B" }],
    )).toBe(false);
  });
});
