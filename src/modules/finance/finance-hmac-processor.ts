import { createHmac, timingSafeEqual } from "node:crypto";
import type { FinanceProcessor } from "./finance-service";
import type { ProviderEvent } from "./finance-domain";

/**
 * Explicit HMAC processor adapter for a provider that has contractually agreed
 * to this exact envelope. This is NOT a Stripe/PayPal webhook adapter.
 * A provider must document its signing protocol before production use.
 */
export class HmacFinanceProcessor implements FinanceProcessor {
  readonly name: string;
  readonly configured: boolean;
  private readonly secret: string;
  constructor(config: { provider: string; webhookSecret: string }) {
    if (!config.provider || !config.webhookSecret || config.webhookSecret.length < 32)
      throw new Error("Payment processor requires explicit provider and strong webhook secret");
    this.name = config.provider;
    this.secret = config.webhookSecret;
    this.configured = true;
  }
  async requestPayment(): Promise<{ kind: "unavailable"; reason: string }> {
    return { kind: "unavailable", reason: "Payment initiation adapter is not provisioned" };
  }
  async verifyWebhook(rawPayload: string, signature: string): Promise<{
    event: ProviderEvent; verification: { verifiedByAdapter: true; provider: string };
  }> {
    if (rawPayload.length > 65536 || !/^[a-f0-9]{64}$/.test(signature))
      throw new Error("Invalid webhook envelope");
    const digest = createHmac("sha256", this.secret).update(rawPayload, "utf8").digest();
    const supplied = Buffer.from(signature, "hex");
    if (supplied.length !== digest.length || !timingSafeEqual(supplied, digest))
      throw new Error("Invalid webhook signature");
    const parsed: unknown = JSON.parse(rawPayload);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid webhook event");
    const p = parsed as Record<string, unknown>;
    if (p.provider !== this.name || typeof p.eventId !== "string" || !p.eventId ||
        typeof p.obligationId !== "string" || !p.obligationId ||
        typeof p.providerPaymentId !== "string" || !p.providerPaymentId ||
        !["payment_succeeded", "refund_succeeded", "chargeback"].includes(String(p.kind)) ||
        !p.amount || typeof p.amount !== "object") throw new Error("Invalid webhook event");
    const amount = p.amount as Record<string, unknown>;
    if (amount.currency !== "USD" || !Number.isSafeInteger(amount.cents) || (amount.cents as number) <= 0)
      throw new Error("Invalid webhook amount");
    if (p.kind === "refund_succeeded" && (typeof p.providerRefundId !== "string" || !p.providerRefundId))
      throw new Error("Missing provider refund reference");
    return {
      event: {
        provider: this.name, eventId: p.eventId, obligationId: p.obligationId,
        providerPaymentId: p.providerPaymentId,
        kind: p.kind as ProviderEvent["kind"],
        amount: { currency: "USD", cents: amount.cents as number },
        ...(typeof p.providerRefundId === "string" ? { providerRefundId: p.providerRefundId } : {}),
        verified: true,
      },
      verification: { verifiedByAdapter: true, provider: this.name },
    };
  }
}
