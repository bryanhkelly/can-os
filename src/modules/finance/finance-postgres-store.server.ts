import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { applications } from "../../db/schema/admissions";
import { financialObligations } from "../../db/schema/governance";
import { programs } from "../../db/schema/organizations";
import { financeInvoices, financeProviderEvents, financeReceipts } from "../../db/schema/finance";
import { applyVerifiedEvent, type Charge, type FinanceRecord, type ProviderEvent } from "./finance-domain";
import type { FinanceStore } from "./finance-service";

/**
 * Postgres-backed finance journal. The invoice row lock serializes competing
 * captures/refunds. The provider-event unique constraint protects retries.
 * No payment movement occurs until the signed provider adapter calls this store.
 */
export const postgresFinanceStore: FinanceStore = {
  async readCanonicalObligation(id) {
    const [r] = await db.select({
      id: financialObligations.id, householdId: financialObligations.householdId,
      subjectType: financialObligations.subjectType, subjectId: financialObligations.subjectId,
      amountCents: financialObligations.amountCents, currency: financialObligations.currency,
    }).from(financialObligations).where(eq(financialObligations.id, id)).limit(1);
    return r ?? null;
  },
  async readCanonicalApplication(id) {
    const [r] = await db.select({
      id: applications.id, householdId: applications.householdId,
      programId: applications.programId, institutionId: programs.organizationId, siteId: programs.siteId,
    }).from(applications).innerJoin(programs, eq(programs.id, applications.programId))
      .where(eq(applications.id, id)).limit(1);
    return r ?? null;
  },
  async readInvoice(obligationId) {
    const [invoice] = await db.select().from(financeInvoices)
      .where(eq(financeInvoices.obligationId, obligationId)).limit(1);
    if (!invoice) return null;
    const events = await db.select({ provider: financeProviderEvents.provider, eventId: financeProviderEvents.eventId })
      .from(financeProviderEvents).where(eq(financeProviderEvents.invoiceId, invoice.id));
    return project(invoice, events.map(e => e.provider + ":" + e.eventId));
  },
  async createInvoice(charge) {
    await db.transaction(async tx => {
      const [ob] = await tx.select().from(financialObligations)
        .where(eq(financialObligations.id, charge.obligationId)).limit(1).for("update");
      const [application] = await tx.select({
        householdId: applications.householdId, institutionId: programs.organizationId,
        siteId: programs.siteId,
      }).from(applications).innerJoin(programs, eq(programs.id, applications.programId))
        .where(eq(applications.id, charge.enrollmentId)).limit(1);
      if (!ob || ob.householdId !== charge.householdId ||
          ob.subjectType !== "application" || ob.subjectId !== charge.enrollmentId ||
          ob.amountCents !== charge.amount.cents || ob.currency !== charge.amount.currency ||
          !application || application.householdId !== charge.householdId ||
          application.institutionId !== charge.institutionId || application.siteId !== charge.siteId)
        throw new Error("Canonical obligation/application changed before invoice creation");
      const existing = await tx.select().from(financeInvoices)
        .where(eq(financeInvoices.obligationId, charge.obligationId)).limit(1);
      if (existing.length) throw new Error("Invoice already exists for obligation");
      await tx.insert(financeInvoices).values({
        obligationId: charge.obligationId, applicationId: charge.enrollmentId,
        householdId: charge.householdId, institutionId: charge.institutionId, siteId: charge.siteId,
        collector: charge.collector, policyVersion: charge.allocation.policyVersion,
        amountCents: charge.amount.cents, currency: charge.amount.currency,
        churchShareCents: charge.allocation.churchCents, canShareCents: charge.allocation.canCents,
      });
    });
  },
  async postVerifiedEvent(event) {
    if (!event.verified) throw new Error("Processor evidence must be verified");
    return db.transaction(async tx => {
      const [invoice] = await tx.select().from(financeInvoices)
        .where(eq(financeInvoices.obligationId, event.obligationId)).limit(1).for("update");
      if (!invoice) throw new Error("Invoice not found for processor event");
      const prior = await tx.select().from(financeProviderEvents)
        .where(and(eq(financeProviderEvents.provider, event.provider), eq(financeProviderEvents.eventId, event.eventId))).limit(1);
      if (prior.length) {
        const old = prior[0];
        if (old.invoiceId !== invoice.id || old.eventKind !== event.kind ||
            old.providerPaymentId !== event.providerPaymentId ||
            old.providerRefundId !== (event.providerRefundId ?? null) ||
            old.amountCents !== event.amount.cents || old.currency !== event.amount.currency)
          throw new Error("Provider event identity collision");
        const events = await tx.select({ provider: financeProviderEvents.provider, eventId: financeProviderEvents.eventId })
          .from(financeProviderEvents).where(eq(financeProviderEvents.invoiceId, invoice.id));
        return project(invoice, events.map(e => e.provider + ":" + e.eventId));
      }
      const events = await tx.select({ provider: financeProviderEvents.provider, eventId: financeProviderEvents.eventId })
        .from(financeProviderEvents).where(eq(financeProviderEvents.invoiceId, invoice.id));
      if (invoice.provider && invoice.provider !== event.provider) throw new Error("Processor identity conflict");
      const current = project(invoice, events.map(e => e.provider + ":" + e.eventId));
      const next = applyVerifiedEvent(current, event);
      const [inserted] = await tx.insert(financeProviderEvents).values({
        invoiceId: invoice.id, provider: event.provider, eventId: event.eventId,
        eventKind: event.kind, providerPaymentId: event.providerPaymentId,
        providerRefundId: event.providerRefundId ?? null, amountCents: event.amount.cents,
        currency: event.amount.currency, verifiedAt: new Date(),
      }).returning({ id: financeProviderEvents.id });
      await tx.update(financeInvoices).set({
        capturedCents: next.capturedCents, refundedCents: next.refundedCents,
        chargebackCents: next.chargebackCents, providerPaymentId: next.providerPaymentId ?? null,
        provider: event.provider,
        updatedAt: new Date(),
      }).where(eq(financeInvoices.id, invoice.id));
      if (event.kind === "payment_succeeded" || event.kind === "refund_succeeded") {
        await tx.insert(financeReceipts).values({
          invoiceId: invoice.id, providerEventId: inserted.id,
          kind: event.kind === "payment_succeeded" ? "payment" : "refund",
          amountCents: event.amount.cents,
        });
      }
      return next;
    });
  },
};

type InvoiceRow = typeof financeInvoices.$inferSelect;
function project(row: InvoiceRow, seenEvents: string[]): FinanceRecord {
  const charge: Charge = {
    obligationId: row.obligationId, enrollmentId: row.applicationId,
    householdId: row.householdId, institutionId: row.institutionId, siteId: row.siteId,
    collector: row.collector, amount: { currency: "USD", cents: row.amountCents },
    allocation: { partnerSiteId: row.siteId, policyVersion: row.policyVersion,
      churchCents: row.churchShareCents, canCents: row.canShareCents },
  };
  if (row.currency !== "USD") throw new Error("Unsupported invoice currency");
  return { charge, providerPaymentId: row.providerPaymentId ?? undefined,
    capturedCents: row.capturedCents, refundedCents: row.refundedCents,
    chargebackCents: row.chargebackCents, seenEvents };
}
