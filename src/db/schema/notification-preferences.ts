import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";

/** Per-person delivery and contact permissions; SMS starts disabled. */
export const notificationPreferences = pgTable("notification_preferences", {
  id: id(),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  timezone: text("timezone").default("UTC").notNull(),
  quietStart: text("quiet_start"),
  quietEnd: text("quiet_end"),
  smsOptedIn: boolean("sms_opted_in").default(false).notNull(),
  smsConsentAt: timestamp("sms_consent_at", { withTimezone: true }),
  smsVerifiedPhone: text("sms_verified_phone"),
  smsVerifiedAt: timestamp("sms_verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("notification_preferences_person_uq").on(table.personId),
  index("notification_preferences_sms_idx").on(table.smsOptedIn),
]);
