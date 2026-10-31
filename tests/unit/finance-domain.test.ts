import { describe, expect, it } from "vitest";
import { applyVerifiedEvent, settlement, type FinanceRecord, type ProviderEvent } from "../../src/modules/finance/finance-domain";

const charge = { obligationId: "ob1", enrollmentId: "en1", householdId: "hh1", institutionId: "org1", siteId: "site1", collector: "CAN" as const, amount: { currency: "USD" as const, cents: 10000 }, allocation: { partnerSiteId: "site1", policyVersion: "2026-v1", churchCents: 2000, canCents: 8000 } };
const empty = (): FinanceRecord => ({ charge, capturedCents: 0, refundedCents: 0, chargebackCents: 0, seenEvents: [] });
const paid: ProviderEvent = { provider: "test", eventId: "evt1", kind: "payment_succeeded", obligationId: "ob1", providerPaymentId: "pay1", amount: charge.amount, verified: true };
describe("finance reconciliation", () => {
  it("ties payment and full refund to the original enrollment and partner allocation", () => {
    const captured = applyVerifiedEvent(empty(), paid);
    expect(settlement(captured)).toMatchObject({ enrollmentId: "en1", churchCents: 2000, canCents: 8000 });
    const refunded = applyVerifiedEvent(captured, { ...paid, eventId: "evt2", kind: "refund_succeeded", providerRefundId: "refund1" });
    expect(settlement(refunded)).toMatchObject({ obligationId: "ob1", enrollmentId: "en1", policyVersion: "2026-v1", netCents: 0, churchCents: 0, canCents: 0 });
  });
  it("deduplicates provider events", () => { const record = applyVerifiedEvent(empty(), paid); expect(applyVerifiedEvent(record, paid)).toBe(record); });
  it("rejects browser claims", () => expect(() => applyVerifiedEvent(empty(), { ...paid, verified: false })).toThrow());
  it("rejects refunds without an original capture", () => expect(() => applyVerifiedEvent(empty(), { ...paid, kind: "refund_succeeded", providerRefundId: "r" })).toThrow());
  it("rejects cross-obligation events", () => expect(() => applyVerifiedEvent(empty(), { ...paid, obligationId: "other" })).toThrow());
  it("rejects over-refunds", () => { const record = applyVerifiedEvent(empty(), paid); expect(() => applyVerifiedEvent(record, { ...paid, eventId: "evt2", kind: "refund_succeeded", providerRefundId: "r", amount: { currency: "USD", cents: 10001 } })).toThrow(); });
});
