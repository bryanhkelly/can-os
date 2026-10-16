import { describe, expect, it } from "vitest";
import {
  offerHoldsSeat,
  transitionAdmissionsOffer,
  type OfferRecord,
} from "@/domain/admissions-offer-lifecycle";
import { assessAdmissionsCapacity } from "@/domain/admissions-capacity";
import { evaluateOfferEligibility } from "@/domain/admissions-offers";

const now = new Date("2026-10-16T12:00:00.000Z");
const offer = (overrides: Partial<OfferRecord> = {}): OfferRecord => ({
  applicationId: "synthetic-application-1",
  schoolYearId: "synthetic-year-2027",
  status: "issued",
  expiresAt: "2026-10-17T12:00:00.000Z",
  ...overrides,
});

describe("admissions synthetic cross-persona lifecycle contract", () => {
  it("lets a guardian accept a live offer and retains the seat until activation", () => {
    const accepted = transitionAdmissionsOffer(offer(), "accept", now);
    expect(accepted.status).toBe("accepted");
    expect(offerHoldsSeat(accepted, new Date("2026-11-01T00:00:00Z"))).toBe(true);
    expect(() => transitionAdmissionsOffer(accepted, "decline", now)).toThrow("Invalid offer transition");
    expect(() => transitionAdmissionsOffer(accepted, "revoke", now)).toThrow("Invalid offer transition");
  });

  it("rejects late guardian acceptance at and after expiry", () => {
    for (const expiresAt of ["2026-10-16T12:00:00.000Z", "2026-10-15T12:00:00.000Z"]) {
      expect(() => transitionAdmissionsOffer(offer({ expiresAt }), "accept", now)).toThrow("Offer expired");
      expect(offerHoldsSeat(offer({ expiresAt }), now)).toBe(false);
    }
  });

  it("releases a declined or expired offer's seat but not an accepted seat", () => {
    const declined = transitionAdmissionsOffer(offer(), "decline", now);
    const expired = transitionAdmissionsOffer(
      offer({ expiresAt: "2026-10-15T12:00:00.000Z" }),
      "expire",
      now,
    );
    expect(offerHoldsSeat(declined, now)).toBe(false);
    expect(offerHoldsSeat(expired, now)).toBe(false);
    expect(offerHoldsSeat(offer({ status: "accepted", expiresAt: "2026-10-15T12:00:00.000Z" }), now)).toBe(true);
  });

  it("prevents registrar offer issuance without requirements, seat configuration, or space", () => {
    const base = { stage: "application", requirementsReady: true, policy: { seats: 2, waitlistEnabled: false }, enrolled: 1, otherOutstandingOffers: 0 };
    expect(evaluateOfferEligibility(base)).toEqual({ eligible: true, reason: "eligible" });
    expect(evaluateOfferEligibility({ ...base, requirementsReady: false }).reason).toBe("requirements_incomplete");
    expect(evaluateOfferEligibility({ ...base, stage: "accepted" }).reason).toBe("invalid_stage");
    expect(evaluateOfferEligibility({ ...base, policy: { seats: null, waitlistEnabled: false } }).reason).toBe("capacity_unconfigured");
    expect(evaluateOfferEligibility({ ...base, otherOutstandingOffers: 1 }).reason).toBe("capacity_full");
    expect(evaluateOfferEligibility({ ...base, policy: { seats: 2, waitlistEnabled: true }, otherOutstandingOffers: 1 }).reason).toBe("waitlist_available");
  });

  it("never calculates negative remaining seats when enrollment exceeds capacity", () => {
    expect(assessAdmissionsCapacity({ seats: 1, waitlistEnabled: false }, 2, 1)).toMatchObject({ remaining: 0, status: "full" });
    expect(() => assessAdmissionsCapacity({ seats: 2, waitlistEnabled: false }, -1, 0)).toThrow("Invalid occupancy");
    expect(() => assessAdmissionsCapacity({ seats: 1.5, waitlistEnabled: false }, 0, 0)).toThrow("Invalid seat capacity");
  });
});
