import { describe, expect, it } from "vitest";
import { nextAllowedDelivery } from "@/domain/notification-quiet-hours";
describe("notification quiet hours", () => {
  it("defers overnight Pacific reminders until local morning", () => {
    const at = new Date("2026-10-17T05:00:00Z"); // Oct 16, 10 PM PDT
    const next = nextAllowedDelivery(at, "America/Los_Angeles", "21:00", "07:00");
    expect(next).toEqual(new Date("2026-10-17T14:00:00Z"));
  });
  it("allows outside quiet hours", () => {
    expect(nextAllowedDelivery(new Date("2026-10-16T19:00:00Z"), "America/Los_Angeles", "21:00", "07:00")).toBeNull();
  });
  it("supports quiet hours spanning midday", () => {
    const time = new Date("2026-10-16T18:30:00Z");
    expect(nextAllowedDelivery(time, "UTC", "18:00", "19:00"))
      .toEqual(new Date("2026-10-16T19:00:00Z"));
  });
  it("does not defer when no policy is configured", () => {
    expect(nextAllowedDelivery(new Date(), "UTC", null, null)).toBeNull();
  });
  it.each([
    ["2027-03-14T09:30:00Z", "2027-03-14T14:00:00Z"],
    ["2026-11-01T07:30:00Z", "2026-11-01T15:00:00Z"],
  ])("uses the real morning boundary across DST from %s", (at, expected) => {
    expect(nextAllowedDelivery(new Date(at), "America/Los_Angeles", "22:00", "07:00"))
      .toEqual(new Date(expected));
  });
  it("allows delivery at the first real minute after a skipped quiet end", () => {
    expect(nextAllowedDelivery(new Date("2027-03-14T09:30:00Z"), "America/Los_Angeles", "22:00", "02:30"))
      .toEqual(new Date("2027-03-14T10:00:00Z"));
  });
  it("uses the first permissible occurrence of a repeated quiet end", () => {
    expect(nextAllowedDelivery(new Date("2026-11-01T07:30:00Z"), "America/Los_Angeles", "22:00", "01:30"))
      .toEqual(new Date("2026-11-01T08:30:00Z"));
  });
  it("does not carry seconds past the end boundary", () => {
    expect(nextAllowedDelivery(new Date("2026-10-16T18:30:45Z"), "UTC", "18:00", "19:00"))
      .toEqual(new Date("2026-10-16T19:00:00Z"));
  });
  it("surfaces invalid stored settings instead of bypassing quiet hours", () => {
    expect(() => nextAllowedDelivery(new Date(), "Invalid/Zone", "22:00", "07:00")).toThrow();
    expect(() => nextAllowedDelivery(new Date(), "UTC", "25:00", "07:00")).toThrow();
  });
});
