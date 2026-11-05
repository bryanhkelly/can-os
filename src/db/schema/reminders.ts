import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";
import { notifications } from "./work";

export const scheduledReminders = pgTable("scheduled_reminders", {
  id: id(),
  idempotencyKey: text("idempotency_key").notNull(),
  recipientPersonId: uuid("recipient_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  resourceType: text("resource_type"),
  resourceId: uuid("resource_id"),
  deliverAt: timestamp("deliver_at", { withTimezone: true }).notNull(),
  status: text("status").$type<"pending" | "delivered" | "cancelled" | "failed">().default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "restrict" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("scheduled_reminder_key_uq").on(table.idempotencyKey),
  uniqueIndex("scheduled_reminder_notification_uq").on(table.notificationId),
  index("scheduled_reminder_due_idx").on(table.deliverAt, table.nextAttemptAt).where(sql`${table.status} = 'pending'`),
  index("scheduled_reminder_resource_idx").on(table.resourceType, table.resourceId),
  check("scheduled_reminder_status_check", sql`${table.status} in ('pending', 'delivered', 'cancelled', 'failed')`),
  check("scheduled_reminder_attempts_check", sql`${table.attempts} >= 0`),
  check("scheduled_reminder_receipt_check", sql`(${table.status} = 'delivered') = (${table.notificationId} is not null and ${table.deliveredAt} is not null)`),
]);