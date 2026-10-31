import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { applications } from "../../db/schema/admissions";
import { financialObligations } from "../../db/schema/governance";
import { programs } from "../../db/schema/organizations";
import { financeInvoices, financePaymentAttempts, financeProviderEvents, financeReceipts } from "../../db/schema/finance";
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
  async reservePaymentAttempt(input) {
    return db.transaction(async tx => {
      const [invoice] = await tx.select().from(financeInvoices)
        .where(eq(financeInvoices.obligationId, input.obligationId)).limit(1).for("update");
      if (!invoice) throw new Error("Invoice not found");
      const [canonical] = await tx.select({ amountCents: financialObligations.amountCents,
        householdId: financialObligations.householdId, currency: financialObligations.currency,
        subjectType: financialObligations.subjectType, subjectId: financialObligations.subjectId })
        .from(financialObligations).where(eq(financialObligations.id, invoice.obligationId)).limit(1);
      const [currentApplication] = await tx.select({ householdId: applications.householdId,
        institutionId: programs.organizationId, siteId: programs.siteId })
        .from(applications).innerJoin(programs, eq(programs.id, applications.programId))
        .where(eq(applications.id, invoice.applicationId)).limit(1);
      if (!currentApplication || currentApplication.householdId !== invoice.householdId ||
          currentApplication.institutionId !== invoice.institutionId || currentApplication.siteId !== invoice.siteId ||
          !canonical || canonical.amountCents !== invoice.amountCents ||
          canonical.householdId !== invoice.householdId || canonical.currency !== invoice.currency ||
          canonical.subjectType !== "application" || canonical.subjectId !== invoice.applicationId)
        throw new Error("Stale canonical finance obligation");
      if (invoice.provider && invoice.provider !== input.provider) throw new Error("Processor conflict");
      const [prior] = await tx.select().from(financePaymentAttempts)
        .where(and(eq(financePaymentAttempts.invoiceId, invoice.id),
          eq(financePaymentAttempts.idempotencyKey, input.idempotencyKey))).limit(1);
      if (prior) {
        if (prior.provider !== input.provider || prior.amountCents !== input.amountCents)
          throw new Error("Payment idempotency conflict");
        return { kind: "existing" as const, status: prior.status === "requires_configuration" ? "failed" as const : prior.status,
          ...(prior.providerIntentId ? { intentId: prior.providerIntentId } : {}) };
      }
      if (input.amountCents <= 0 || input.amountCents > invoice.amountCents - invoice.capturedCents)
        throw new Error("Invalid payment attempt amount");
      await tx.insert(financePaymentAttempts).values({
        invoiceId: invoice.id, idempotencyKey: input.idempotencyKey,
        provider: input.provider, amountCents: input.amountCents, status: "pending",
      });
      return { kind: "reserved" as const, status: "pending" as const };
    });
  },
  async finishPaymentAttempt(input) {
    await db.transaction(async tx => {
      const [invoice] = await tx.select().from(financeInvoices)
        .where(eq(financeInvoices.obligationId, input.obligationId)).limit(1).for("update");
      if (!invoice) throw new Error("Invoice not found");
      const [attempt] = await tx.select().from(financePaymentAttempts)
        .where(and(eq(financePaymentAttempts.invoiceId, invoice.id),
          eq(financePaymentAttempts.idempotencyKey, input.idempotencyKey))).limit(1);
      if (!attempt || attempt.status !== "pending") throw new Error("Payment attempt state conflict");
      if (input.status === "submitted" && !input.intentId) throw new Error("Missing provider intent");
      await tx.update(financePaymentAttempts).set({
        status: input.status, providerIntentId: input.intentId ?? null, updatedAt: new Date(),
      }).where(eq(financePaymentAttempts.id, attempt.id));
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
      const old = prior[0];
      if (old) {
        if (old.invoiceId !== invoice.id || old.eventKind !== event.kind ||
            old.providerPaymentId !== event.providerPaymentId ||
            old.providerRefundId !== (event.providerRefundId ?? null) ||
            old.amountCents !== event.amount.cents || old.currency !== event.amount.currency)
          throw new Error("Provider event identity collision");
        const events = await tx.select({ provider: financeProviderEvents.provider, eventId: financeProviderEvents.eventId })
          .from(financeProviderEvents).where(eq(financeProviderEvents.invoiceId, invoice.id));
        return project(invoice, events.map(e => e.provider + ":" + e.eventId));
      }
      if (event.kind === "refund_succeeded" && event.providerRefundId) {
        const [sameRefund] = await tx.select().from(financeProviderEvents)
          .where(and(eq(financeProviderEvents.provider, event.provider),
            eq(financeProviderEvents.providerRefundId, event.providerRefundId))).limit(1);
        if (sameRefund) {
          if (sameRefund.invoiceId !== invoice.id || sameRefund.amountCents !== event.amount.cents ||
              sameRefund.providerPaymentId !== event.providerPaymentId ||
              sameRefund.eventKind !== "refund_succeeded")
            throw new Error("Provider refund identity collision");
          const priorEvents = await tx.select({ provider: financeProviderEvents.provider,
            eventId: financeProviderEvents.eventId }).from(financeProviderEvents)
            .where(eq(financeProviderEvents.invoiceId, invoice.id));
          return project(invoice, priorEvents.map(e => e.provider + ":" + e.eventId));
        }
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
      if (!inserted) throw new Error("Provider event insert did not return an id");
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
