import { describe, expect, it } from "vitest";
import { dateKeyInTimezone, dateTimeInputInTimezone, dateTimeInputValue, localDayBoundsInTimezone } from "@/modules/calendar/timezone";

describe("calendar timezone conversion", () => {
  it("round-trips event wall time in a non-browser timezone", () => {
    const instant = dateTimeInputInTimezone("2027-01-15T09:30", "America/Los_Angeles");
    expect(instant).toBe("2027-01-15T17:30:00.000Z");
    expect(dateTimeInputValue(instant, "America/Los_Angeles")).toBe("2027-01-15T09:30");
    expect(dateKeyInTimezone(instant, "America/Los_Angeles")).toBe("2027-01-15");
  });

  it("uses daylight-saving offsets and rejects nonexistent local times", () => {
    expect(dateTimeInputInTimezone("2027-07-15T09:30", "America/Los_Angeles"))
      .toBe("2027-07-15T16:30:00.000Z");
    expect(() => dateTimeInputInTimezone("2027-03-14T02:30", "America/Los_Angeles"))
      .toThrow("does not exist");
    expect(dateTimeInputInTimezone("2027-11-07T01:30", "America/Los_Angeles"))
      .toBe("2027-11-07T08:30:00.000Z");
  });

  it("rejects invalid date/time input and timezone names", () => {
    expect(() => dateTimeInputInTimezone("2027-02-30T09:30", "UTC"))
      .toThrow("valid date and time");
    expect(() => dateTimeInputInTimezone("2027-01-15T09:30", "No/Such_Zone"))
      .toThrow();
  });
});

describe("school-local daily boundaries", () => {
  it("includes the local evening that belongs to the next UTC day", () => {
    const { start, end } = localDayBoundsInTimezone(new Date("2027-01-16T06:30:00Z"), "America/Los_Angeles");
    expect(start.toISOString()).toBe("2027-01-15T08:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-16T08:00:00.000Z");
  });
  it("handles the 23-hour spring and 25-hour autumn school day", () => {
    const spring = localDayBoundsInTimezone(new Date("2027-03-14T18:00:00Z"), "America/Los_Angeles");
    expect(spring.start.toISOString()).toBe("2027-03-14T08:00:00.000Z");
    expect(spring.end.toISOString()).toBe("2027-03-15T07:00:00.000Z");
    const autumn = localDayBoundsInTimezone(new Date("2027-11-07T18:00:00Z"), "America/Los_Angeles");
    expect(autumn.start.toISOString()).toBe("2027-11-07T07:00:00.000Z");
    expect(autumn.end.toISOString()).toBe("2027-11-08T08:00:00.000Z");
  });
  it("keeps independent school days for Sites in different timezones", () => {
    const at = new Date("2027-01-15T05:00:00Z");
    const pacific = localDayBoundsInTimezone(at, "America/Los_Angeles");
    const eastern = localDayBoundsInTimezone(at, "America/New_York");
    expect(pacific.start.toISOString()).toBe("2027-01-14T08:00:00.000Z");
    expect(eastern.start.toISOString()).toBe("2027-01-15T05:00:00.000Z");
  });
});
