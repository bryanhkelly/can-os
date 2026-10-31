import { createHmac, timingSafeEqual } from "node:crypto";
import type { FinanceProcessor } from "./finance-service";
import type { ProviderEvent } from "./finance-domain";

/** Stripe PaymentIntents REST adapter. Requires server-side keys and raw signed webhooks. */
export class StripeFinanceProcessor implements FinanceProcessor {
  readonly name = "stripe";
  readonly configured: boolean;
  constructor(private readonly secretKey: string, private readonly webhookSecret: string) {
    this.configured = secretKey.startsWith("sk_") && webhookSecret.startsWith("whsec_");
  }
  async requestPayment(input: { obligationId: string; amountCents: number; currency: "USD"; idempotencyKey: string }) {
    if (!this.configured) return { kind: "unavailable" as const, reason: "Stripe setup required" };
    if (!input.obligationId || !input.idempotencyKey || input.idempotencyKey.length > 255 || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
      throw new Error("Invalid payment request");
    const body = new URLSearchParams({
      amount: String(input.amountCents), currency: "usd",
      "metadata[obligationId]": input.obligationId,
      "automatic_payment_methods[enabled]": "true",
    });
    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.secretKey,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body,
    });
    if (!response.ok) throw new Error("Stripe intent request failed");
    const result: unknown = await response.json();
    const intentId = (result as { id?: unknown } | null)?.id;
    const clientSecret = (result as { client_secret?: unknown } | null)?.client_secret;
    if (typeof intentId !== "string" || !intentId.startsWith("pi_")) throw new Error("Invalid Stripe intent response");
    if (typeof clientSecret !== "string" || !clientSecret.startsWith(intentId + "_secret_"))
      throw new Error("Missing Stripe client secret");
    return { kind: "submitted" as const, intentId, clientSecret };
  }
  async verifyWebhook(rawPayload: string, signature: string): Promise<{
    event: ProviderEvent; verification: { verifiedByAdapter: true; provider: string };
  }> {
    if (!this.configured) throw new Error("Stripe setup required");
    if (Buffer.byteLength(rawPayload, "utf8") > 65536) throw new Error("Webhook too large");
    const pairs = signature.split(",").map(s => s.trim().split("="));
    const timestamp = pairs.find(p => p[0] === "t")?.[1];
    const signatures = pairs.filter(p => p[0] === "v1").map(p => p[1]).filter((v): v is string => !!v);
    if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
      throw new Error("Stale Stripe signature");
    const expected = createHmac("sha256", this.webhookSecret).update(timestamp + "." + rawPayload).digest();
    if (!signatures.some(hex => /^[0-9a-fA-F]{64}$/.test(hex) &&
      timingSafeEqual(Buffer.from(hex, "hex"), expected))) throw new Error("Invalid Stripe signature");
    const parsed: unknown = JSON.parse(rawPayload);
    const envelope = parsed as { id?: unknown; type?: unknown; data?: { object?: Record<string, unknown> } };
    const obj = envelope?.data?.object;
    if (!obj || typeof envelope.id !== "string") throw new Error("Invalid Stripe event");
    // PaymentIntent carries the canonical metadata and captured amount.
    if (envelope.type !== "payment_intent.succeeded") throw new Error("Unsupported Stripe event type");
    const obligationId = (obj.metadata as { obligationId?: unknown } | undefined)?.obligationId;
    if (typeof obligationId !== "string" || !obligationId || typeof obj.id !== "string" ||
      obj.currency !== "usd" || !Number.isSafeInteger(obj.amount_received) ||
      (obj.amount_received as number) <= 0) throw new Error("Invalid Stripe payment evidence");
    return {
      event: {
        provider: "stripe", eventId: envelope.id, kind: "payment_succeeded",
        obligationId, providerPaymentId: obj.id,
        amount: { currency: "USD", cents: obj.amount_received as number }, verified: true,
      },
      verification: { verifiedByAdapter: true, provider: "stripe" },
    };
  }
}
