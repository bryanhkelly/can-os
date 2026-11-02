import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { StripeFinanceProcessor } from "../../src/modules/finance/finance-stripe-processor.server";

const processor = new StripeFinanceProcessor("sk_test_fixture", "whsec_fixture");
function signed(payload: string, timestamp: number) {
  const hex = createHmac("sha256", "whsec_fixture").update(timestamp + "." + payload).digest("hex");
  return "t=" + timestamp + ",v1=" + hex;
}
describe("Stripe processor boundary", () => {
  it("rejects tampering and stale signatures", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded",
      data: { object: { id: "pi_1", currency: "usd", amount_received: 2000,
        metadata: { obligationId: "ob" } } } });
    const now = Math.floor(Date.now() / 1000);
    await expect(processor.verifyWebhook(body, signed(body, now))).resolves.toMatchObject({
      event: { provider: "stripe", obligationId: "ob", providerPaymentId: "pi_1",
        kind: "payment_succeeded", amount: { cents: 2000 }, verified: true },
    });
    await expect(processor.verifyWebhook(body + " ", signed(body, now))).rejects.toThrow("signature");
    await expect(processor.verifyWebhook(body, signed(body, now - 1000))).rejects.toThrow("Stale");
  });
  it("does not treat a payment intent submission as capture", async () => {
    const mock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "pi_123", client_secret: "pi_123_secret_fixture" }) }));
    vi.stubGlobal("fetch", mock);
    try {
      await expect(processor.requestPayment({ obligationId: "ob", amountCents: 2000,
        currency: "USD", idempotencyKey: "request-1" })).resolves.toEqual({
        kind: "submitted", intentId: "pi_123", clientSecret: "pi_123_secret_fixture",
      });
      expect(mock).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
});
