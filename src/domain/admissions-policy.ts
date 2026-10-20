/**
 * Single source of truth for admissions seat-holding policy.
 *
 * An offer reserves a seat when it is accepted, or issued and unexpired.
 * Issued offers with no expiry hold their seat until acted on.
 * Offers with an unparseable expiry are treated as expired (fail closed).
 *
 * Previously this rule was copy-pasted across admissions-offer-lifecycle,
 * admissions-offer-selection, and admissions-seat-occupancy. Those modules
 * now delegate here; keep their public exports stable.
 */
export type SeatHoldingOffer = {
 status: string;
 expiresAt: string | Date | null;
};

export function offerHoldsSeat(offer: SeatHoldingOffer, now: Date = new Date()): boolean {
 if (offer.status === "accepted") return true;
 if (offer.status !== "issued") return false;
 if (!offer.expiresAt) return true;
 const expiry = offer.expiresAt instanceof Date ? offer.expiresAt : new Date(offer.expiresAt);
 return Number.isFinite(expiry.getTime()) && expiry.getTime() > now.getTime();
}

export function assertApplicationOffersAllowed(application: { stage: string; metadata: Record<string, unknown> }) {
 if (application.metadata.admissionsDisposition === "waitlisted")
  throw new Error("Restore the waitlisted application to review before issuing or accepting an offer.");
 if (!["application", "eligibility", "accepted"].includes(application.stage))
  throw new Error("This application is not open for enrollment offers.");
}
