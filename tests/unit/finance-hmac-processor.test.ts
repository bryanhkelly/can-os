import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ingestSignedWebhook } from "../../src/modules/finance/finance-service";
import type { FinanceStore } from "../../src/modules/finance/finance-service";
import { HmacFinanceProcessor } from "../../src/modules/finance/finance-hmac-processor";
const secret = "a".repeat(64);
const event = { provider: "configured-provider", eventId: "event-1", kind: "payment_succeeded", obligationId: "obligation-1", providerPaymentId: "payment-1", amount: { currency: "USD", cents: 10000 } };
const sign = (payload: string) => createHmac("sha256", secret).update(payload).digest("hex");
describe("signed finance processor", () => {
  const processor = new HmacFinanceProcessor({ provider: "configured-provider", webhookSecret: secret });
  it("verifies exact raw payload and returns trusted evidence", async () => {
    const payload = JSON.stringify(event);
    await expect(processor.verifyWebhook(payload, sign(payload))).resolves.toMatchObject({
      event: { ...event, verified: true },
      verification: { verifiedByAdapter: true, provider: "configured-provider" },
    });
  });
  it("rejects tampered signed content", async () => {
    const payload = JSON.stringify(event);
    await expect(processor.verifyWebhook(payload.replace("10000", "10001"), sign(payload))).rejects.toThrow("signature");
  });
  it("rejects forged signatures", async () => {
    await expect(processor.verifyWebhook(JSON.stringify(event), "0".repeat(64))).rejects.toThrow("signature");
  });
  it("rejects a different provider even with valid HMAC", async () => {
    const payload = JSON.stringify({ ...event, provider: "other" });
    await expect(processor.verifyWebhook(payload, sign(payload))).rejects.toThrow("event");
  });
  it("rejects malformed refund evidence", async () => {
    const payload = JSON.stringify({ ...event, kind: "refund_succeeded" });
    await expect(processor.verifyWebhook(payload, sign(payload))).rejects.toThrow("refund");
  });
  it("never initiates fake live payments", async () => {
    await expect(processor.requestPayment()).resolves.toMatchObject({ kind: "unavailable" });
  });
  it("requires a strong explicit secret", () => {
    expect(() => new HmacFinanceProcessor({ provider: "x", webhookSecret: "short" })).toThrow();
  });
});

describe("server-side webhook ingestion", () => {
  it("never calls persistence for a bad signature", async () => {
    let writes = 0;
    const store = { postVerifiedEvent: async () => { writes++; throw new Error("not expected"); } } as unknown as FinanceStore;
    const processor = new HmacFinanceProcessor({ provider: "configured-provider", webhookSecret: secret });
    await expect(ingestSignedWebhook(store, processor, JSON.stringify(event), "0".repeat(64))).rejects.toThrow("signature");
    expect(writes).toBe(0);
  });
});
