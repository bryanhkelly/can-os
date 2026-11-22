import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { domainEvents } from "./work";
import { organizations, programs, sites } from "./organizations";

/**
 * Durable reporting projection receipts, NOT another business-event ledger.
 * A row records that a canonical outbox event was examined exactly once.
 * Only accepted rows may contribute to observed source-event counts.
 */
export const reportingSourceEventReceipts = pgTable("reporting_source_event_receipts", {
  eventId: uuid("event_id").primaryKey().references(() => domainEvents.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  status: text("status").$type<"accepted" | "duplicate" | "legacy" | "retry_pending">().notNull(),
  sourceKind: text("source_kind"),
  sourceId: uuid("source_id"),
  sourceVersion: text("source_version"),
  dedupKey: text("dedup_key"),
  payloadFingerprint: text("payload_fingerprint"),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
  programId: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
  correctionOfEventId: uuid("correction_of_event_id").references(() => domainEvents.id, { onDelete: "restrict" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  projectedAt: timestamp("projected_at", { withTimezone: true }).notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
}, table => [
  uniqueIndex("reporting_source_canonical_revision_uq").on(table.dedupKey)
    .where(sql`${table.status} = 'accepted'`),
  index("reporting_source_site_period_idx")
    .on(table.organizationId, table.siteId, table.occurredAt)
    .where(sql`${table.status} = 'accepted'`),
  index("reporting_source_program_period_idx")
    .on(table.programId, table.occurredAt)
    .where(sql`${table.status} = 'accepted' AND ${table.programId} IS NOT NULL`),
  index("reporting_source_correction_idx").on(table.correctionOfEventId),
  index("reporting_source_retry_idx").on(table.status,table.nextAttemptAt),
  check("reporting_source_receipt_status_ck",
    sql`${table.status} IN ('accepted','duplicate','legacy','retry_pending')`),
  check("reporting_source_receipt_data_ck", sql`(
    (${table.status} IN ('accepted','duplicate')
      AND ${table.sourceKind} IS NOT NULL
      AND ${table.sourceId} IS NOT NULL
      AND ${table.sourceVersion} IS NOT NULL
      AND ${table.dedupKey} IS NOT NULL
      AND ${table.payloadFingerprint} IS NOT NULL
      AND ${table.organizationId} IS NOT NULL
      AND ${table.siteId} IS NOT NULL)
    OR
    (${table.status} IN ('legacy','retry_pending')
      AND ${table.dedupKey} IS NULL
      AND ${table.payloadFingerprint} IS NULL)
  )`),
  check("reporting_source_retry_state_ck",sql`(
    (${table.status} = 'retry_pending' AND ${table.attempts} > 0
      AND ${table.nextAttemptAt} IS NOT NULL)
    OR
    (${table.status} <> 'retry_pending' AND ${table.nextAttemptAt} IS NULL)
  )`),
]);
