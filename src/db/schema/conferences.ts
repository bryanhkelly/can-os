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
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import {
  conferenceBookingStatus,
  conferenceSeriesStatus,
  conferenceSlotStatus,
} from "./enums";
import { people, studentProfiles } from "./identity";
import { sections } from "./academics";
import { sites } from "./organizations";
import { calendarEvents } from "./calendar";
import { communicationThreads } from "./communication";

export const conferenceSeries = pgTable(
  "conference_series",
  {
    id: id(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, {
      onDelete: "restrict",
    }),
    teacherPersonId: uuid("teacher_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    slotMinutes: integer("slot_minutes").default(20).notNull(),
    status: conferenceSeriesStatus("status").default("draft").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("conference_series_teacher_time_idx").on(table.teacherPersonId, table.startsAt),
    index("conference_series_site_time_idx").on(table.siteId, table.startsAt),
  ],
);

export const conferenceSlots = pgTable(
  "conference_slots",
  {
    id: id(),
    conferenceSeriesId: uuid("conference_series_id")
      .notNull()
      .references(() => conferenceSeries.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: conferenceSlotStatus("status").default("available").notNull(),
    calendarEventId: uuid("calendar_event_id").references(() => calendarEvents.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("conference_slot_series_time_uq").on(table.conferenceSeriesId, table.startsAt),
    index("conference_slot_status_idx").on(table.conferenceSeriesId, table.status),
  ],
);

export const conferenceBookings = pgTable(
  "conference_bookings",
  {
    id: id(),
    conferenceSlotId: uuid("conference_slot_id")
      .notNull()
      .references(() => conferenceSlots.id, { onDelete: "restrict" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    guardianPersonId: uuid("guardian_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    status: conferenceBookingStatus("status").default("booked").notNull(),
    communicationThreadId: uuid("communication_thread_id").references(
      () => communicationThreads.id,
      { onDelete: "restrict" },
    ),
    bookedAt: timestamp("booked_at", { withTimezone: true }).defaultNow().notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // One active booking per slot; cancelled bookings remain in history but
    // release the slot. Mirrors applied migration 0046's enumerated statuses.
    uniqueIndex("conference_slot_booking_uq").on(table.conferenceSlotId).where(
      sql`status IN ('booked', 'held', 'no_show')`,
    ),
    index("conference_booking_student_idx").on(table.studentProfileId),
    index("conference_booking_guardian_idx").on(table.guardianPersonId),
  ],
);

export const conferenceNotes = pgTable(
  "conference_notes",
  {
    id: id(),
    conferenceBookingId: uuid("conference_booking_id")
      .notNull()
      .references(() => conferenceBookings.id, { onDelete: "cascade" }),
    authorPersonId: uuid("author_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    visibility: text("visibility").default("staff_private").notNull(),
    note: text("note").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("conference_note_booking_idx").on(table.conferenceBookingId)],
);
