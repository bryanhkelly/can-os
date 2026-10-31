import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { financialObligations } from "./governance";
import { applications } from "./admissions";
import { households } from "./identity";
import { organizations, sites } from "./organizations";

/** One finance account per existing canonical obligation. No parallel enrollment or charge ledger. */
export const financeInvoices = pgTable("finance_invoices", {
  id: id(),
  obligationId: uuid("obligation_id").notNull().references(() => financialObligations.id, { onDelete: "restrict" }),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "restrict" }),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "restrict" }),
  institutionId: uuid("institution_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  collector: text("collector").$type<"CAN" | "CHURCH">().notNull(),
  provider: text("provider"),
  processorAccountId: text("processor_account_id"),
  policyVersion: text("policy_version").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").default("USD").notNull(),
  capturedCents: integer("captured_cents").default(0).notNull(),
  refundedCents: integer("refunded_cents").default(0).notNull(),
  chargebackCents: integer("chargeback_cents").default(0).notNull(),
  providerPaymentId: text("provider_payment_id"),
  churchShareCents: integer("church_share_cents").notNull(),
  canShareCents: integer("can_share_cents").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex("finance_invoice_obligation_uq").on(t.obligationId),
  index("finance_invoice_institution_site_idx").on(t.institutionId, t.siteId),
  index("finance_invoice_household_idx").on(t.householdId),
  index("finance_invoice_application_idx").on(t.applicationId),
]);

/** Attempts never imply settlement; provider-confirmed events alone create financial movements. */
export const financePaymentAttempts = pgTable("finance_payment_attempts", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => financeInvoices.id, { onDelete: "restrict" }),
  idempotencyKey: text("idempotency_key").notNull(),
  provider: text("provider").notNull(),
  providerIntentId: text("provider_intent_id"),
  status: text("status").$type<"pending" | "requires_configuration" | "failed" | "submitted">().notNull(),
  errorCode: text("error_code"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex("finance_attempt_idempotency_uq").on(t.invoiceId, t.idempotencyKey),
  index("finance_attempt_invoice_idx").on(t.invoiceId),
]);

/** Immutable processor-evidence journal; the provider/event key must be unique in Postgres. */
export const financeProviderEvents = pgTable("finance_provider_events", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => financeInvoices.id, { onDelete: "restrict" }),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  eventKind: text("event_kind").$type<"payment_succeeded" | "refund_succeeded" | "chargeback">().notNull(),
  providerPaymentId: text("provider_payment_id").notNull(),
  providerRefundId: text("provider_refund_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  evidence: jsonb("evidence").$type<{ signatureAlgorithm?: string; payloadDigest?: string }>().default({}).notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex("finance_provider_event_uq").on(t.provider, t.eventId),
  index("finance_provider_invoice_idx").on(t.invoiceId, t.createdAt),
]);

/** Monotonic receipt identifiers for verified capture and refund events; no card data. */
export const financeReceipts = pgTable("finance_receipts", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => financeInvoices.id, { onDelete: "restrict" }),
  providerEventId: uuid("provider_event_id").notNull().references(() => financeProviderEvents.id, { onDelete: "restrict" }),
  kind: text("kind").$type<"payment" | "refund">().notNull(),
  amountCents: integer("amount_cents").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  uniqueIndex("finance_receipt_event_uq").on(t.providerEventId),
  index("finance_receipt_invoice_idx").on(t.invoiceId),
]);
