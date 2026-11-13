import { index, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { educationV30, type JsonObject } from "./core";

export const auditEvents = educationV30.table(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorPersonId: uuid("actor_person_id"),
    owningOrganizationId: uuid("owning_organization_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    eventCode: text("event_code").notNull(),
    entityKind: text("entity_kind").notNull(),
    entityId: uuid("entity_id").notNull(),
    payload: jsonb("payload").$type<JsonObject>().notNull().default({}),
  },
  (table) => [
    index("audit_events_time_idx").on(table.occurredAt.desc()),
  ],
);

export const domainEvents = educationV30.table(
  "domain_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    actorPersonId: uuid("actor_person_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status")
      .$type<"pending" | "processing" | "processed" | "failed">()
      .notNull()
      .default("pending"),
    payload: jsonb("payload").$type<JsonObject>().notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("domain_events_status_time_idx").on(table.status, table.occurredAt),
    index("domain_events_aggregate_idx").on(table.aggregateType, table.aggregateId),
  ],
);
