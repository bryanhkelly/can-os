import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { attendanceStatus, excuseStatus } from "./enums";
import { studentProfiles, people } from "./identity";
import { programs, sites } from "./organizations";
import { sections } from "./academics";

export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    occurrenceKey: text("occurrence_key").notNull(),
    status: attendanceStatus("status").notNull(),
    expectedAt: timestamp("expected_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    recordedByPersonId: uuid("recorded_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    sourceKey: text("source_key"),
    supersedesAttendanceEventId: uuid("supersedes_attendance_event_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("attendance_student_time_idx").on(table.studentProfileId, table.expectedAt),
    index("attendance_occurrence_idx").on(table.occurrenceKey),
    index("attendance_program_time_idx").on(table.programId, table.expectedAt),
    uniqueIndex("attendance_source_key_uq").on(table.sourceKey),
    index("attendance_supersedes_idx").on(table.supersedesAttendanceEventId),
  ],
);

export const attendanceExcuses = pgTable(
  "attendance_excuses",
  {
    id: id(),
    attendanceEventId: uuid("attendance_event_id")
      .notNull()
      .references(() => attendanceEvents.id, { onDelete: "restrict" }),
    submittedByPersonId: uuid("submitted_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    status: excuseStatus("status").default("submitted").notNull(),
    reason: text("reason").notNull(),
    documentIds: jsonb("document_ids").$type<string[]>().default([]).notNull(),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("attendance_excuse_event_idx").on(table.attendanceEventId)],
);
