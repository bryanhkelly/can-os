import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Transport receipts only. The Class, Enrollment, Session and domain event
 * remain authoritative. No email address, consent or classroom link is stored. */
export const classParticipantDeliveries = pgTable("class_participant_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull(),
  deliveryKey: text("delivery_key").notNull(),
  classId: uuid("class_id").notNull(),
  sourceId: uuid("source_id").notNull(),
  recipientPersonId: uuid("recipient_person_id").notNull(),
  classSessionId: uuid("class_session_id"),
  kind: text("kind").$type<
    "enrollment_confirmed" | "invitation_issued" | "session_scheduled" | "session_changed" | "session_reminder"
  >().notNull(),
  status: text("status").$type<
    "pending" | "processing" | "accepted" | "failed" | "suppressed"
  >().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("class_participant_delivery_event_key_uq").on(table.eventId, table.deliveryKey),
  index("class_participant_delivery_dispatch_idx").on(table.status, table.nextAttemptAt),
  index("class_participant_delivery_class_idx").on(table.classId, table.createdAt),
]);
