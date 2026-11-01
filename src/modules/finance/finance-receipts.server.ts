import type { FinanceIdentity, FinanceStore } from "./finance-service";
import { authorizeFinance } from "./finance-service";
import { db } from "../../db/client";
import { financeInvoices, financeProviderEvents, financeReceipts } from "../../db/schema/finance";
import { eq } from "drizzle-orm";

/** Receipts are immutable proof of recorded provider evidence, not payment instructions. */
export async function listFinanceReceipts(
  store: FinanceStore, identity: FinanceIdentity, obligationId: string,
) {
  const record = await store.readInvoice(obligationId);
  if (!record) return [];
  authorizeFinance(identity, record.charge, "read");
  const [invoice] = await db.select({ id: financeInvoices.id }).from(financeInvoices)
    .where(eq(financeInvoices.obligationId, obligationId)).limit(1);
  if (!invoice) return [];
  const rows = await db.select({
    id: financeReceipts.id, kind: financeReceipts.kind,
    amountCents: financeReceipts.amountCents, issuedAt: financeReceipts.issuedAt,
    provider: financeProviderEvents.provider, providerEventId: financeProviderEvents.eventId,
  }).from(financeReceipts).innerJoin(financeProviderEvents,
    eq(financeReceipts.providerEventId, financeProviderEvents.id))
    .where(eq(financeReceipts.invoiceId, invoice.id));
  return rows.map(row => ({
    ...row, obligationId, currency: "USD" as const,
  }));
}
