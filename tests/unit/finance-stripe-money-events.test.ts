import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StripeFinanceProcessor } from "../../src/modules/finance/finance-stripe-processor.server";
import { resolveStripeMoneyEvent } from "../../src/modules/finance/finance-stripe-money-events.server";

const processor = new StripeFinanceProcessor("sk_test_fixture", "whsec_fixture");
function sign(payload: string) {
  const t = Math.floor(Date.now() / 1000);
  return "t=" + t + ",v1=" + createHmac("sha256", "whsec_fixture")
    .update(t + "." + payload).digest("hex");
}
function payload(type: string, object: object) {
  return JSON.stringify({ id: "evt_123", type, data: { object } });
}
afterEach(() => vi.unstubAllGlobals());
describe("Stripe refund/dispute evidence", () => {
  it("resolves confirmed refund to canonical PaymentIntent metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true, json: async () => url.includes("/charges/")
        ? { payment_intent: "pi_1" }
        : { id: "pi_1", currency: "usd", metadata: { obligationId: "ob" } },
    })));
    const body = payload("refund.updated", { id: "re_1", charge: "ch_1",
      status: "succeeded", amount: 1000 });
    await expect(resolveStripeMoneyEvent(processor, "sk_test_fixture", "whsec_fixture",
      body, sign(body))).resolves.toMatchObject({
        provider: "stripe", kind: "refund_succeeded", providerRefundId: "re_1",
        providerPaymentId: "pi_1", obligationId: "ob", amount: { cents: 1000 },
      });
  });
  it("rejects pending refunds before fetching provider objects", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const body = payload("refund.updated", { id: "re_1", charge: "ch_1",
      status: "pending", amount: 1000 });
    await expect(resolveStripeMoneyEvent(processor, "sk_test_fixture", "whsec_fixture",
      body, sign(body))).rejects.toThrow("not confirmed");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects forged signatures without fetching provider objects", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const body = payload("charge.dispute.created", { charge: "ch_1", amount: 1000 });
    await expect(resolveStripeMoneyEvent(processor, "sk_test_fixture", "whsec_fixture",
      body, "t=1,v1=" + "0".repeat(64))).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
