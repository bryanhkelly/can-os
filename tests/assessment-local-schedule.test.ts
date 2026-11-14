import { describe, expect, it } from "vitest";
import { assessmentClockToUtc, assessmentDueAtForDate } from "@/domain/assessment-local-schedule";
import { dateKeyInTimezone, dateTimeInputValue } from "@/modules/calendar/timezone";

describe("teacher assessment schedules follow the Section timezone", () => {
  it("assigns the last minute of the specified class calendar date, not the viewer timezone", () => {
    const losAngeles=assessmentDueAtForDate("2026-11-14","America/Los_Angeles");
    const tokyo=assessmentDueAtForDate("2026-11-14","Asia/Tokyo");
    expect(losAngeles).toBe("2026-11-15T07:59:00.000Z");
    expect(tokyo).toBe("2026-11-14T14:59:00.000Z");
    expect(dateKeyInTimezone(losAngeles,"America/Los_Angeles")).toBe("2026-11-14");
    expect(dateKeyInTimezone(tokyo,"Asia/Tokyo")).toBe("2026-11-14");
  });

  it("preserves school-day cutoff across spring and fall daylight-saving changes", () => {
    expect(assessmentDueAtForDate("2026-03-08","America/Los_Angeles"))
      .toBe("2026-03-09T06:59:00.000Z");
    expect(assessmentDueAtForDate("2026-11-01","America/Los_Angeles"))
      .toBe("2026-11-02T07:59:00.000Z");
  });

  it("converts release and close clocks from the class timezone and rejects ambiguous times", () => {
    const release=assessmentClockToUtc("2026-11-14T09:00","America/Los_Angeles");
    expect(release).toBe("2026-11-14T17:00:00.000Z");
    expect(dateTimeInputValue(release,"America/Los_Angeles")).toBe("2026-11-14T09:00");
    expect(()=>assessmentClockToUtc("2026-11-01T01:30","America/Los_Angeles"))
      .toThrow(/ambiguous/i);
    expect(()=>assessmentClockToUtc("2026-03-08T02:30","America/Los_Angeles"))
      .toThrow(/does not exist/i);
  });

  it("rejects invalid calendar dates and invalid timezones", () => {
    expect(()=>assessmentDueAtForDate("2026-02-30","America/Los_Angeles")).toThrow();
    expect(()=>assessmentDueAtForDate("2026-11-14","not-a-timezone")).toThrow();
  });
});
