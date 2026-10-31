import { describe, expect, it, vi } from "vitest";
import { initiateGuardianPayment } from "../../src/modules/finance/finance-payment-initiation.server";
import type { FinanceStore, FinanceProcessor } from "../../src/modules/finance/finance-service";
import type { FinanceRecord } from "../../src/modules/finance/finance-domain";

const record: FinanceRecord = {
  charge: { obligationId: "ob", enrollmentId: "app", householdId: "house", institutionId: "inst",
    siteId: "site", collector: "CAN", amount: { currency: "USD", cents: 10000 },
    allocation: { partnerSiteId: "site", policyVersion: "v1", churchCents: 2000, canCents: 8000 } },
  capturedCents: 4000, refundedCents: 0, chargebackCents: 0, seenEvents: [],
};
const identity = {
  viewer: "guardian" as const, authorizedHouseholdIds: ["house"],
  context: { actorPersonId: "person", capabilities: new Set(["finance.read.own"]), scope: {} },
};
function fixture() {
  const store = {
    readInvoice: vi.fn(async () => record),
    reservePaymentAttempt: vi.fn(async () => ({ kind: "reserved" as const, status: "pending" as const })),
    finishPaymentAttempt: vi.fn(async () => {}),
  } as unknown as FinanceStore;
  const processor = {
    configured: true, name: "test",
    requestPayment: vi.fn(async () => ({ kind: "submitted" as const, intentId: "pi_123" })),
  } as unknown as FinanceProcessor;
  return { store, processor };
}
describe("guardian payment intent", () => {
  it("derives outstanding amount server-side and persists intent outcome", async () => {
    const { store, processor } = fixture();
    await expect(initiateGuardianPayment(store, processor, identity, "ob", "key1"))
      .resolves.toEqual({ kind: "submitted", intentId: "pi_123" });
    expect(processor.requestPayment).toHaveBeenCalledWith({
      obligationId: "ob", amountCents: 6000, currency: "USD", idempotencyKey: "key1",
    });
    expect(store.finishPaymentAttempt).toHaveBeenCalledWith({
      obligationId: "ob", idempotencyKey: "key1", status: "submitted", intentId: "pi_123",
    });
  });
  it("does not call provider on idempotent replay", async () => {
    const { store, processor } = fixture();
    store.reservePaymentAttempt = vi.fn(async () => ({ kind: "existing", status: "submitted", intentId: "pi_123" }));
    await expect(initiateGuardianPayment(store, processor, identity, "ob", "key1"))
      .resolves.toEqual({ kind: "unavailable", reason: "Existing payment intent requires server-side reconciliation before checkout" });
    expect(processor.requestPayment).not.toHaveBeenCalled();
  });
  it("rejects unsafe projected outstanding cents", async () => {
    const { store, processor } = fixture();
    store.readInvoice = vi.fn(async () => ({ ...record, capturedCents: Number.NaN }));
    await expect(initiateGuardianPayment(store, processor, identity, "ob", "key1"))
      .rejects.toThrow("Invalid outstanding balance");
    expect(processor.requestPayment).not.toHaveBeenCalled();
  });
  it("rejects a guardian from a different household", async () => {
    const { store, processor } = fixture();
    await expect(initiateGuardianPayment(store, processor, {
      ...identity, authorizedHouseholdIds: ["other"],
    }, "ob", "key1")).rejects.toThrow();
    expect(processor.requestPayment).not.toHaveBeenCalled();
  });
});
