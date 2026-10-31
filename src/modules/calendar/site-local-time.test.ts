import { describe, expect, it } from "vitest";
import { siteLocalTimeToIso, isoToSiteLocalInput } from "./site-local-time";

describe("site-local time", () => {
  it("converts ordinary local time", () => {
    expect(siteLocalTimeToIso("2026-07-01T12:30", "America/Los_Angeles"))
      .toBe("2026-07-01T19:30:00.000Z");
  });
  it("rejects nonexistent spring-forward time", () => {
    expect(() => siteLocalTimeToIso("2026-03-08T02:30", "America/Los_Angeles"))
      .toThrow(/does not exist/);
  });
  it("requires explicit fall-back disambiguation", () => {
    expect(() => siteLocalTimeToIso("2026-11-01T01:30", "America/Los_Angeles"))
      .toThrow(/ambiguous/);
    expect(siteLocalTimeToIso("2026-11-01T01:30", "America/Los_Angeles", "earlier"))
      .toBe("2026-11-01T08:30:00.000Z");
    expect(siteLocalTimeToIso("2026-11-01T01:30", "America/Los_Angeles", "later"))
      .toBe("2026-11-01T09:30:00.000Z");
  });
  it("supports non-hour offsets and reverse conversion", () => {
    const iso = siteLocalTimeToIso("2026-06-01T09:15", "Asia/Kathmandu");
    expect(iso).toBe("2026-06-01T03:30:00.000Z");
    expect(isoToSiteLocalInput(iso, "Asia/Kathmandu")).toBe("2026-06-01T09:15");
  });
  it("handles half-hour DST transitions", () => {
    expect(() => siteLocalTimeToIso("2026-10-04T02:15", "Australia/Lord_Howe")).toThrow(/does not exist/);
    expect(() => siteLocalTimeToIso("2026-04-05T01:45", "Australia/Lord_Howe")).toThrow(/ambiguous/);
  });
  it("rejects invalid calendar values and timezone", () => {
    expect(() => siteLocalTimeToIso("2026-02-30T10:00", "UTC")).toThrow();
    expect(() => siteLocalTimeToIso("2026-06-01T10:00", "Mars/Base")).toThrow();
    expect(() => siteLocalTimeToIso("2026-06-01T10:00", "UTC", "guess" as never)).toThrow(/policy/);
  });
});
