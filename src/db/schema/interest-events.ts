import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";
import { organizations, programs, sites } from "./organizations";
import { publicAdmissionsInterests } from "./public-admissions-interests";

export const interestEvents = pgTable("interest_events", {
  id: id(),
  requestId: uuid("request_id").notNull(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  kind: text("kind").notNull(),
  location: text("location").notNull().default(""),
  visibility: text("visibility").notNull(),
  status: text("status").notNull().default("published"),
  invitationTokenDigest: text("invitation_token_digest"),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("interest_events_request_uq").on(table.requestId),
  index("interest_events_program_status_idx").on(table.programId, table.status),
  index("interest_events_site_status_idx").on(table.siteId, table.status),
]);

export const interestEventRegistrations = pgTable("interest_event_registrations", {
  id: id(),
  requestId: uuid("request_id").notNull(),
  eventId: uuid("event_id").notNull().references(() => interestEvents.id, { onDelete: "restrict" }),
  publicInterestId: uuid("public_interest_id").notNull()
    .references(() => publicAdmissionsInterests.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("registered"),
  attendanceStatus: text("attendance_status").$type<"attended" | "no_show">(),
  attendanceMarkedAt: timestamp("attendance_marked_at", { withTimezone: true }),
  attendanceMarkedByPersonId: uuid("attendance_marked_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("interest_event_registrations_request_uq").on(table.requestId),
  uniqueIndex("interest_event_registrations_event_interest_uq").on(table.eventId, table.publicInterestId),
  index("interest_event_registrations_event_status_idx").on(table.eventId, table.status),
  check("interest_event_registration_attendance_check", sql`(
    ${table.attendanceStatus} is null and ${table.attendanceMarkedAt} is null and ${table.attendanceMarkedByPersonId} is null
  ) or (
    ${table.attendanceStatus} in ('attended', 'no_show') and ${table.attendanceMarkedAt} is not null and
    ${table.attendanceMarkedByPersonId} is not null
  )`),
]);

export const interestEventEmailDeliveries = pgTable("interest_event_email_deliveries", {
  id: id(),
  registrationId: uuid("registration_id").notNull()
    .references(() => interestEventRegistrations.id, { onDelete: "restrict" }),
  kind: text("kind").$type<"confirmation" | "reminder_24h" | "reminder_2h" | "follow_up_attended" | "follow_up_no_show">().notNull(),
  deliverAt: timestamp("deliver_at", { withTimezone: true }).notNull(),
  status: text("status").$type<"pending" | "processing" | "delivered" | "failed" | "cancelled">().default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  providerAcceptedAt: timestamp("provider_accepted_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("interest_event_email_delivery_registration_kind_uq").on(table.registrationId, table.kind),
  index("interest_event_email_delivery_due_idx").on(table.deliverAt, table.nextAttemptAt)
    .where(sql`${table.status} in ('pending', 'failed', 'processing')`),
  check("interest_event_email_delivery_kind_check", sql`${table.kind} in (
    'confirmation', 'reminder_24h', 'reminder_2h', 'follow_up_attended', 'follow_up_no_show'
  )`),
  check("interest_event_email_delivery_status_check", sql`${table.status} in (
    'pending', 'processing', 'delivered', 'failed', 'cancelled'
  )`),
  check("interest_event_email_delivery_attempts_check", sql`${table.attempts} >= 0`),
  check("interest_event_email_delivery_receipt_check", sql`(
    (${table.status} = 'delivered') = (${table.providerAcceptedAt} is not null)
  )`),
]);
