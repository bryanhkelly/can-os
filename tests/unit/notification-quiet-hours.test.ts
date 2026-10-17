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
});
