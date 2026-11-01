import { createHmac, timingSafeEqual } from "node:crypto";
import type { FinanceProcessor } from "./finance-service";
import type { ProviderEvent } from "./finance-domain";

/** Verify Stripe's signed raw webhook and resolve non-PaymentIntent object references
 * against the Stripe API before journal insertion. Never trust browser-supplied IDs. */
export async function resolveStripeMoneyEvent(
  processor: FinanceProcessor,
  secretKey: string,
  webhookSecret: string,
  rawPayload: string,
  signature: string,
): Promise<ProviderEvent> {
  if (!secretKey.startsWith("sk_") || !webhookSecret.startsWith("whsec_"))
    throw new Error("Stripe configuration unavailable");
  if (Buffer.byteLength(rawPayload, "utf8") > 65536) throw new Error("Stripe webhook too large");
  const fields = signature.split(",").map(x => x.trim().split("="));
  const timestamp = fields.find(x => x[0] === "t")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300)
    throw new Error("Stale Stripe webhook");
  const digest = createHmac("sha256", webhookSecret).update(timestamp + "." + rawPayload).digest();
  const verified = fields.filter(x => x[0] === "v1").some(x =>
    !!x[1] && /^[0-9a-fA-F]{64}$/.test(x[1]) &&
    timingSafeEqual(Buffer.from(x[1], "hex"), digest));
  if (!verified) throw new Error("Invalid Stripe signature");
  const payload = JSON.parse(rawPayload) as {
    id?: string; type?: string; data?: { object?: Record<string, unknown> };
  };
  const object = payload.data?.object;
  if (!payload.id || !object) throw new Error("Invalid Stripe webhook");
  if (payload.type === "payment_intent.succeeded") {
    const result = await processor.verifyWebhook(rawPayload, signature);
    return result.event;
  }
  if (payload.type !== "refund.updated" && payload.type !== "charge.dispute.created")
    throw new Error("Unsupported Stripe money event");
  if (payload.type === "refund.updated" && object.status !== "succeeded")
    throw new Error("Refund is not confirmed");
  const chargeId = payload.type === "refund.updated" ? object.charge : object.charge;
  if (typeof chargeId !== "string" || !chargeId.startsWith("ch_"))
    throw new Error("Missing Stripe charge reference");
  const response = await fetch("https://api.stripe.com/v1/charges/" + encodeURIComponent(chargeId), {
    headers: { Authorization: "Bearer " + secretKey },
  });
  if (!response.ok) throw new Error("Unable to reconcile Stripe charge");
  const charge = await response.json() as {
    payment_intent?: unknown; currency?: unknown; metadata?: { obligationId?: unknown };
  };
  if (typeof charge.payment_intent !== "string" || !charge.payment_intent.startsWith("pi_"))
    throw new Error("Unlinked Stripe charge");
  // Fetch the canonical PaymentIntent rather than relying on mutable charge metadata.
  const intentResponse = await fetch("https://api.stripe.com/v1/payment_intents/" +
    encodeURIComponent(charge.payment_intent), {
    headers: { Authorization: "Bearer " + secretKey },
  });
  if (!intentResponse.ok) throw new Error("Unable to reconcile Stripe intent");
  const intent = await intentResponse.json() as {
    id?: unknown; currency?: unknown; metadata?: { obligationId?: unknown };
  };
  const obligationId = intent.metadata?.obligationId;
  const amount = object.amount;
  if (intent.id !== charge.payment_intent || intent.currency !== "usd" ||
      typeof obligationId !== "string" || !obligationId ||
      !Number.isSafeInteger(amount) || (amount as number) <= 0)
    throw new Error("Invalid Stripe money evidence");
  if (payload.type === "refund.updated" && (typeof object.id !== "string" || !object.id.startsWith("re_")))
    throw new Error("Invalid Stripe refund identity");
  return {
    provider: "stripe", eventId: payload.id,
    kind: payload.type === "refund.updated" ? "refund_succeeded" : "chargeback",
    obligationId, providerPaymentId: charge.payment_intent,
    amount: { currency: "USD", cents: amount as number },
    ...(payload.type === "refund.updated" ? { providerRefundId: object.id as string } : {}),
    verified: true,
  };
}
