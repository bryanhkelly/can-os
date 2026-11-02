import { describe, expect, it } from "vitest";
import { isLaunchOpeningDate, launchOpeningDate } from "../../src/domain/launch-opening-date";
describe("launch opening date", () => {
  it("retains a date-only target without timezone conversion", () => {
    expect(launchOpeningDate({ targetOpeningDate: "2027-08-16", creditMode: "credit_bearing" })).toBe("2027-08-16");
  });
  it("accepts actual leap days", () => {
    expect(isLaunchOpeningDate("2028-02-29")).toBe(true);
  });
  it("rejects rolled-over and incomplete dates", () => {
    for (const value of ["2027-02-29", "2027-04-31", "2027-13-01", "2027-00-10",
      "2027-8-16", "2027-08-16T00:00:00Z", "0000-01-01", "9999-12-31", "", null, {}])
      expect(isLaunchOpeningDate(value)).toBe(false);
  });
  it("keeps existing Programs without a target usable", () => {
    expect(launchOpeningDate({ creditMode: "non_credit" })).toBeUndefined();
    expect(launchOpeningDate({ targetOpeningDate: "bad" })).toBeUndefined();
  });
});

