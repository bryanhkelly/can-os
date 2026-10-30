import { describe, expect, it } from "vitest";
import { dateKeyInTimezone, dateTimeInputInTimezone, dateTimeInputValue } from "@/modules/calendar/timezone";

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
