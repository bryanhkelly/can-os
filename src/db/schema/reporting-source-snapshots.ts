import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, sites } from "./organizations";
import { people } from "./identity";
import { reportingSourceEventReceipts } from "./reporting-source-event-receipts";

/** Internal immutable snapshots, not external/published impact reports. */
export const reportingSourceSnapshots = pgTable("reporting_source_snapshots", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull()
    .references(() => organizations.id, {onDelete:"restrict"}),
  siteId: uuid("site_id").notNull()
    .references(() => sites.id, {onDelete:"restrict"}),
  periodStart: timestamp("period_start",{withTimezone:true}).notNull(),
  periodEnd: timestamp("period_end",{withTimezone:true}).notNull(),
  asOf: timestamp("as_of",{withTimezone:true}).notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  createdByPersonId: uuid("created_by_person_id").notNull()
    .references(() => people.id,{onDelete:"restrict"}),
  sourceCount: integer("source_count").notNull(),
  manifestDigest: text("manifest_digest").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
}, table => [
  index("reporting_snapshots_scope_time_idx").on(table.organizationId,table.siteId,table.createdAt),
  check("reporting_snapshots_period_ck",sql`${table.periodStart} < ${table.periodEnd}
    AND ${table.periodEnd} <= ${table.asOf}`),
  check("reporting_snapshots_count_ck",sql`${table.sourceCount} BETWEEN 0 AND 2000`),
  check("reporting_snapshots_digest_ck",sql`${table.manifestDigest} ~ '^[0-9a-f]{64}$'`),
  check("reporting_snapshots_schema_ck",sql`${table.schemaVersion} = 1`),
]);

export const reportingSourceSnapshotEvents = pgTable("reporting_source_snapshot_events", {
  snapshotId: uuid("snapshot_id").notNull().references(() => reportingSourceSnapshots.id,{onDelete:"restrict"}),
  eventId: uuid("event_id").notNull().references(() => reportingSourceEventReceipts.eventId,{onDelete:"restrict"}),
  payloadFingerprint: text("payload_fingerprint").notNull(),
  sourceVersion: text("source_version").notNull(),
}, table => [
  primaryKey({name:"reporting_source_snapshot_events_pk",
    columns:[table.snapshotId,table.eventId]}),
  index("reporting_snapshot_events_source_idx").on(table.eventId),
  check("reporting_snapshot_events_digest_ck",sql`${table.payloadFingerprint} ~ '^[0-9a-f]{64}$'`),
  check("reporting_snapshot_events_version_ck",sql`char_length(${table.sourceVersion}) BETWEEN 1 AND 128`),
]);
