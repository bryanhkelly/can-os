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
import { people, studentProfiles } from "./identity";
import { programs, sites } from "./organizations";
import { calendarEvents } from "./calendar";
import { consentRecords, financialObligations, sensitiveAccessGrants } from "./governance";
import { incidents } from "./incidents";

export const fieldTrips = pgTable(
  "field_trips",
  {
    id: id(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    programId: uuid("program_id").references(() => programs.id, {
      onDelete: "restrict",
    }),
    calendarEventId: uuid("calendar_event_id").references(() => calendarEvents.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    destination: text("destination").notNull(),
    status: text("status").default("proposed").notNull(),
    proposedByPersonId: uuid("proposed_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    approvedByPersonId: uuid("approved_by_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    departsAt: timestamp("departs_at", { withTimezone: true }).notNull(),
    returnsAt: timestamp("returns_at", { withTimezone: true }).notNull(),
    permissionDueAt: timestamp("permission_due_at", { withTimezone: true }),
    feeAmountCents: integer("fee_amount_cents"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("field_trip_site_status_idx").on(table.siteId, table.status),
    index("field_trip_departure_idx").on(table.departsAt),
  ],
);

export const fieldTripParticipants = pgTable(
  "field_trip_participants",
  {
    id: id(),
    fieldTripId: uuid("field_trip_id")
      .notNull()
      .references(() => fieldTrips.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    status: text("status").default("invited").notNull(),
    consentRecordId: uuid("consent_record_id").references(() => consentRecords.id, {
      onDelete: "restrict",
    }),
    financialObligationId: uuid("financial_obligation_id").references(
      () => financialObligations.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("field_trip_student_uq").on(table.fieldTripId, table.studentProfileId),
    index("field_trip_participant_status_idx").on(table.fieldTripId, table.status),
  ],
);

export const fieldTripChaperones = pgTable(
  "field_trip_chaperones",
  {
    id: id(),
    fieldTripId: uuid("field_trip_id")
      .notNull()
      .references(() => fieldTrips.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    role: text("role").default("chaperone").notNull(),
    accessGrantId: uuid("access_grant_id").references(() => sensitiveAccessGrants.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("field_trip_chaperone_uq").on(table.fieldTripId, table.personId),
  ],
);

export const fieldTripAttendance = pgTable(
  "field_trip_attendance",
  {
    id: id(),
    fieldTripId: uuid("field_trip_id")
      .notNull()
      .references(() => fieldTrips.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    checkpoint: text("checkpoint").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    recordedByPersonId: uuid("recorded_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    sourceKey: text("source_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("field_trip_attendance_source_uq").on(table.sourceKey),
    index("field_trip_attendance_trip_idx").on(table.fieldTripId, table.checkpoint),
  ],
);

export const fieldTripIncidents = pgTable(
  "field_trip_incidents",
  {
    id: id(),
    fieldTripId: uuid("field_trip_id")
      .notNull()
      .references(() => fieldTrips.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("field_trip_incident_uq").on(table.fieldTripId, table.incidentId),
  ],
);
