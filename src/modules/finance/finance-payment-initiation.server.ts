import { AuthorizationError } from "../../domain/command-context";
import type { FinanceIdentity, FinanceProcessor, FinanceStore } from "./finance-service";
import { authorizeFinance } from "./finance-service";

/** Initiation only creates a processor intent; it never marks tuition paid. */
export async function initiateGuardianPayment(
  store: FinanceStore, processor: FinanceProcessor, identity: FinanceIdentity,
  obligationId: string, idempotencyKey: string,
) {
  if (!idempotencyKey || idempotencyKey.length > 255) throw new Error("Invalid idempotency key");
  const record = await store.readInvoice(obligationId);
  if (!record) throw new Error("Invoice not found");
  authorizeFinance(identity, record.charge, "read");
  if (identity.viewer !== "guardian") throw new AuthorizationError("Guardian payment required");
  if (!processor.configured) return { kind: "unavailable" as const, reason: "Payment setup required" };
  const amountCents = record.charge.amount.cents - record.capturedCents;
  if (!Number.isSafeInteger(amountCents)) throw new Error("Invalid outstanding balance");
  if (amountCents <= 0) return { kind: "unavailable" as const, reason: "No unpaid balance" };
  if (!store.reservePaymentAttempt || !store.finishPaymentAttempt)
    throw new Error("Durable payment attempt store required");
  const attempt = await store.reservePaymentAttempt({
    obligationId, idempotencyKey, provider: processor.name, amountCents,
  });
  if (attempt.kind === "existing")
    return { kind: "unavailable" as const, reason: "Existing payment intent requires server-side reconciliation before checkout" };
  const result = await processor.requestPayment({
    obligationId, amountCents, currency: "USD", idempotencyKey,
  });
  await store.finishPaymentAttempt({
    obligationId, idempotencyKey,
    status: result.kind === "submitted" ? "submitted" : "failed",
    ...(result.kind === "submitted" ? { intentId: result.intentId } : {}),
  });
  return result;
}
