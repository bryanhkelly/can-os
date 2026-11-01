import { describe, expect, it } from "vitest";
import type { FinanceStore } from "../../src/modules/finance/finance-service";
import { readFinanceStatement } from "../../src/modules/finance/finance-read-model.server";
import type { FinanceRecord } from "../../src/modules/finance/finance-domain";

const record: FinanceRecord = {
  charge: { obligationId: "ob", enrollmentId: "app", householdId: "house",
    institutionId: "inst", siteId: "site", collector: "CAN",
    amount: { currency: "USD", cents: 10000 },
    allocation: { partnerSiteId: "site", policyVersion: "v1", churchCents: 2000, canCents: 8000 } },
  providerPaymentId: "pay", capturedCents: 10000, refundedCents: 3000,
  chargebackCents: 0, seenEvents: ["processor:capture", "processor:refund"],
};
const store = { readInvoice: async () => record } as unknown as FinanceStore;
const identity = (households: string[]) => ({
  viewer: "guardian" as const,
  authorizedHouseholdIds: households,
  context: { actorPersonId: "guardian", capabilities: new Set(["finance.read.own"]), scope: {} },
});
describe("finance statements", () => {
  it("returns reconciled receipt-independent net settlement for an authorized household", async () => {
    const result = await readFinanceStatement(store, identity(["house"]), "ob", true);
    expect(result?.settlement).toMatchObject({ netCents: 7000, churchCents: 1400, canCents: 5600 });
    expect(result?.state).toBe("partially_paid");
    expect(result?.accountBalanceCents).toBe(3000);
    expect(result?.outstandingCents).toBe(0);
    expect(result?.returnedCents).toBe(3000);
  });
  it("rejects household enumeration", async () => {
    await expect(readFinanceStatement(store, identity(["other"]), "ob", true)).rejects.toThrow();
  });
  it("surfaces missing processor configuration", async () => {
    const result = await readFinanceStatement(store, identity(["house"]), "ob", false);
    expect(result?.state).toBe("not_configured");
  });
});
