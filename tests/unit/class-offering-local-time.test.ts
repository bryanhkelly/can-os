import { describe, expect, it } from "vitest";
import { classOfferingLocalTimeToUtc } from "../../src/domain/class-offering-local-time";

describe("Class Offering registration wall time", () => {
  it("uses the hosting Site timezone, not the operator browser", () => {
    expect(classOfferingLocalTimeToUtc("2027-01-15T10:30", "America/Los_Angeles"))
      .toBe("2027-01-15T18:30:00.000Z");
    expect(classOfferingLocalTimeToUtc("2027-01-15T10:30", "America/New_York"))
      .toBe("2027-01-15T15:30:00.000Z");
  });
  it("keeps optional dates empty without requiring a Site", () => {
    expect(classOfferingLocalTimeToUtc("", null)).toBeNull();
  });
  it("rejects a missing Site timezone for provided dates", () => {
    expect(() => classOfferingLocalTimeToUtc("2027-01-15T10:30", null))
      .toThrow(/configured time zone/);
  });
  it("rejects nonexistent and ambiguous daylight-saving wall times", () => {
    expect(() => classOfferingLocalTimeToUtc("2027-03-14T02:30", "America/Los_Angeles"))
      .toThrow(/daylight-saving/);
    expect(() => classOfferingLocalTimeToUtc("2027-11-07T01:30", "America/Los_Angeles"))
      .toThrow(/daylight-saving/);
  });
});
