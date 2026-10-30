import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import {
  subscriptionChannel,
  subscriptionDeliveryStatus,
  subscriptionStatus,
} from "./enums";
import { conversations } from "./conversations";
import { people } from "./identity";
import { domainEvents } from "./work";
import { notifications } from "./work";

/**
 * A durable standing instruction ("tell me when Bobby misses an assignment").
 * Created via conversation or UI; always inspectable and revocable by the
 * subscriber. Authorization is re-evaluated at delivery time — a subscription
 * is never a cached permission.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    subscriberPersonId: uuid("subscriber_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    eventTypes: text("event_types").array().notNull(),
    /** What the subscription watches, e.g. ("student_profile", <id>). */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** Optional narrowing, e.g. section ids or severity. */
    filter: jsonb("filter").$type<Record<string, unknown>>().default({}).notNull(),
    /**
     * Reminder policy, e.g. { "remindAfterHours": 24 }. Reminders re-check
     * current canonical state and fire only while the condition still holds.
     */
    reminderPolicy: jsonb("reminder_policy")
      .$type<{ remindAfterHours?: number; repeatEveryHours?: number; maxReminders?: number }>()
      .default({})
      .notNull(),
    channel: subscriptionChannel("channel").default("in_app").notNull(),
    status: subscriptionStatus("status").default("active").notNull(),
    /** "conversation" when created through Ask CAN, "ui" otherwise. */
    createdVia: text("created_via").default("ui").notNull(),
    /** The conversation whose confirmed preview created this subscription. */
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("subscription_subject_idx").on(table.subjectType, table.subjectId),
    index("subscription_subscriber_idx").on(table.subscriberPersonId, table.status),
    index("subscription_status_idx").on(table.status),
  ],
);

/**
 * One delivery attempt record per (subscription, event, kind). The unique
 * index makes deliveries idempotent: reprocessing an event can never produce
 * a duplicate notification to the same subscriber.
 */
export const subscriptionDeliveries = pgTable(
  "subscription_deliveries",
  {
    id: id(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    domainEventId: uuid("domain_event_id")
      .notNull()
      .references(() => domainEvents.id, { onDelete: "cascade" }),
    /** "initial" for the event-triggered delivery, "reminder" for follow-ups. */
    kind: text("kind").default("initial").notNull(),
    channel: subscriptionChannel("channel").notNull(),
    status: subscriptionDeliveryStatus("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    lastError: text("last_error"),
    notificationId: uuid("notification_id").references(() => notifications.id, {
      onDelete: "set null",
    }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("subscription_delivery_uq").on(
      table.subscriptionId,
      table.domainEventId,
      table.kind,
    ),
    index("subscription_delivery_status_idx").on(table.status, table.createdAt),
    index("subscription_delivery_retry_idx").on(table.status, table.nextAttemptAt),
  ],
);

/** Independent subscriber-consumer checkpoint, recoverable after handler crashes. */
export const subscriptionEventReceipts = pgTable("subscription_event_receipts", {
  eventId: uuid("event_id").primaryKey()
    .references(() => domainEvents.id, { onDelete: "cascade" }),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});
