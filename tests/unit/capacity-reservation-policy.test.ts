import { describe, expect, it } from "vitest";
import { isCurrentCapacityReservation } from "@/modules/staffing/reservation-policy";

const now = new Date("2030-01-01T12:00:00Z");
describe("current instructional capacity reservations", () => {
  it.each(["held", "committed"] as const)("counts %s only before expiry", status => {
    expect(isCurrentCapacityReservation({ status, expiresAt: null }, now)).toBe(true);
    expect(isCurrentCapacityReservation({ status, expiresAt: new Date(now.getTime() + 1) }, now)).toBe(true);
    expect(isCurrentCapacityReservation({ status, expiresAt: now }, now)).toBe(false);
    expect(isCurrentCapacityReservation({ status, expiresAt: new Date(now.getTime() - 1) }, now)).toBe(false);
    expect(isCurrentCapacityReservation({ status, expiresAt: new Date("invalid") }, now)).toBe(false);
  });
  it("never counts released reservations even without an expiry", () => {
    const status = "released";
    expect(isCurrentCapacityReservation({ status, expiresAt: null }, now)).toBe(false);
    expect(isCurrentCapacityReservation({ status, expiresAt: new Date(now.getTime() + 1) }, now)).toBe(false);
  });
});
