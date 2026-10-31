import type { FinanceStore, FinanceIdentity } from "./finance-service";
import { authorizeFinance, invoiceStatus } from "./finance-service";
import { settlement } from "./finance-domain";

/**
 * Read models are scoped before returning any household financial information.
 * Callers must obtain identity from the server session, never request parameters.
 */
export async function readFinanceStatement(
  store: FinanceStore,
  identity: FinanceIdentity,
  obligationId: string,
  processorConfigured: boolean,
) {
  const record = await store.readInvoice(obligationId);
  if (!record) return null;
  authorizeFinance(identity, record.charge, "read");
  const totals = settlement(record);
  return {
    obligationId: record.charge.obligationId,
    applicationId: record.charge.enrollmentId,
    householdId: record.charge.householdId,
    institutionId: record.charge.institutionId,
    siteId: record.charge.siteId,
    collector: record.charge.collector,
    currency: record.charge.amount.currency,
    originalCents: record.charge.amount.cents,
    capturedCents: record.capturedCents,
    refundedCents: record.refundedCents,
    chargebackCents: record.chargebackCents,
    settlement: totals,
    state: invoiceStatus(record, processorConfigured).state,
  };
}
