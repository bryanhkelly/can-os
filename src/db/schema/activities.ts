import {
  date,
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
import { people, studentProfiles } from "./identity";
import { programs, sites } from "./organizations";
import { calendarEvents } from "./calendar";
import { documents } from "./documents";
import { consentRecords, financialObligations } from "./governance";

export const activities = pgTable(
  "activities",
  {
    id: id(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    programId: uuid("program_id").references(() => programs.id, {
      onDelete: "restrict",
    }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    status: text("status").default("active").notNull(),
    advisorPersonId: uuid("advisor_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("activity_site_type_idx").on(table.siteId, table.type),
  ],
);

export const activitySeasons = pgTable(
  "activity_seasons",
  {
    id: id(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    registrationOpensAt: timestamp("registration_opens_at", { withTimezone: true }),
    registrationClosesAt: timestamp("registration_closes_at", { withTimezone: true }),
    feeAmountCents: integer("fee_amount_cents"),
    capacity: integer("capacity"),
    status: text("status").default("registration").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("activity_season_activity_idx").on(table.activityId)],
);

export const activityRegistrations = pgTable(
  "activity_registrations",
  {
    id: id(),
    activitySeasonId: uuid("activity_season_id")
      .notNull()
      .references(() => activitySeasons.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    status: text("status").default("pending").notNull(),
    consentRecordId: uuid("consent_record_id").references(() => consentRecords.id, {
      onDelete: "restrict",
    }),
    physicalDocumentId: uuid("physical_document_id").references(() => documents.id, {
      onDelete: "restrict",
    }),
    physicalExpiresOn: date("physical_expires_on"),
    financialObligationId: uuid("financial_obligation_id").references(
      () => financialObligations.id,
      { onDelete: "restrict" },
    ),
    eligibilityStatus: text("eligibility_status").default("pending").notNull(),
    rosterStatus: text("roster_status").default("not_rostered").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("activity_registration_student_uq").on(
      table.activitySeasonId,
      table.studentProfileId,
    ),
    index("activity_registration_status_idx").on(table.activitySeasonId, table.status),
    index("activity_physical_expiry_idx").on(table.physicalExpiresOn),
  ],
);

export const activityEligibilityChecks = pgTable(
  "activity_eligibility_checks",
  {
    id: id(),
    activityRegistrationId: uuid("activity_registration_id")
      .notNull()
      .references(() => activityRegistrations.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
    checkedByPersonId: uuid("checked_by_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    ruleVersion: text("rule_version").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}).notNull(),
    validThrough: timestamp("valid_through", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("activity_eligibility_registration_idx").on(table.activityRegistrationId, table.checkedAt),
  ],
);

export const activityCalendarEvents = pgTable(
  "activity_calendar_events",
  {
    id: id(),
    activitySeasonId: uuid("activity_season_id")
      .notNull()
      .references(() => activitySeasons.id, { onDelete: "cascade" }),
    calendarEventId: uuid("calendar_event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("activity_calendar_event_uq").on(table.activitySeasonId, table.calendarEventId),
  ],
);
