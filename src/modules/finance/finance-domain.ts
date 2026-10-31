/**
 * Finance domain boundary. All monetary values are integer minor units.
 * Provider events are evidence, never instructions to trust browser state.
 * Persistence adapter must atomically enforce unique (provider,eventId).
 */
export type Money = { currency: "USD"; cents: number };
export type Allocation = { partnerSiteId: string; policyVersion: string; churchCents: number; canCents: number };
export type Charge = {
  obligationId: string; enrollmentId: string; householdId: string; institutionId: string;
  siteId: string; collector: "CAN" | "CHURCH"; amount: Money; allocation: Allocation;
};
export type ProviderEvent = {
  provider: string; eventId: string; kind: "payment_succeeded" | "refund_succeeded" | "chargeback";
  obligationId: string; providerPaymentId: string; amount: Money;
  providerRefundId?: string; verified: boolean;
};
export type FinanceRecord = {
  charge: Charge; providerPaymentId?: string; capturedCents: number;
  refundedCents: number; chargebackCents: number; seenEvents: string[];
};
export function validateCharge(charge: Charge): void {
  if (!charge.obligationId || !charge.enrollmentId || !charge.householdId || !charge.institutionId || !charge.siteId) throw new Error("Missing canonical reference");
  if (charge.amount.currency !== "USD" || !Number.isSafeInteger(charge.amount.cents) || charge.amount.cents <= 0) throw new Error("Invalid charge");
  const a = charge.allocation;
  if (a.partnerSiteId !== charge.siteId || !a.policyVersion || !Number.isSafeInteger(a.churchCents) || !Number.isSafeInteger(a.canCents) || a.churchCents < 0 || a.canCents < 0 || a.churchCents + a.canCents !== charge.amount.cents) throw new Error("Invalid partner allocation");
}
export function applyVerifiedEvent(record: FinanceRecord, event: ProviderEvent): FinanceRecord {
  validateCharge(record.charge);
  if (!event.verified) throw new Error("Unverified processor event");
  if (!event.provider || !event.eventId || !event.providerPaymentId || event.obligationId !== record.charge.obligationId || event.amount.currency !== record.charge.amount.currency) throw new Error("Provider reference mismatch");
  const key = event.provider + ":" + event.eventId;
  if (record.seenEvents.includes(key)) return record;
  if (!Number.isSafeInteger(event.amount.cents) || event.amount.cents <= 0) throw new Error("Invalid event amount");
  const next = { ...record, seenEvents: [...record.seenEvents, key] };
  if (event.kind === "payment_succeeded") {
    if (record.providerPaymentId && record.providerPaymentId !== event.providerPaymentId) throw new Error("Payment identity conflict");
    if (record.capturedCents + event.amount.cents > record.charge.amount.cents) throw new Error("Capture exceeds invoice");
    next.providerPaymentId = event.providerPaymentId;
    next.capturedCents = record.capturedCents + event.amount.cents;
  } else {
    if (!record.providerPaymentId || record.providerPaymentId !== event.providerPaymentId) throw new Error("Original payment mismatch");
    if (event.kind === "refund_succeeded") {
      if (!event.providerRefundId) throw new Error("Missing refund identity");
      if (record.refundedCents + record.chargebackCents + event.amount.cents > record.capturedCents) throw new Error("Refund exceeds capture");
      next.refundedCents += event.amount.cents;
    } else {
      if (record.refundedCents + record.chargebackCents + event.amount.cents > record.capturedCents) throw new Error("Chargeback exceeds capture");
      next.chargebackCents += event.amount.cents;
    }
  }
  return next;
}
export function settlement(record: FinanceRecord) {
  validateCharge(record.charge);
  const net = record.capturedCents - record.refundedCents - record.chargebackCents;
  if (!Number.isSafeInteger(net) || net < 0 || net > record.charge.amount.cents) throw new Error("Invalid settlement");
  const churchCents = Math.floor(net * record.charge.allocation.churchCents / record.charge.amount.cents);
  return { obligationId: record.charge.obligationId, enrollmentId: record.charge.enrollmentId, policyVersion: record.charge.allocation.policyVersion, netCents: net, churchCents, canCents: net - churchCents };
}
