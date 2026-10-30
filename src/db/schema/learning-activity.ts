import { sql } from "drizzle-orm";
import {
  boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { id, createdAt } from "./common";
import { accessSessions } from "./access";
import { courseTemplateVersions, sections } from "./academics";
import { studentProfiles } from "./identity";
import { programs, sites } from "./organizations";

/**
 * Learning sessions are NOT login sessions or official attendance.
 * Every start and event is scoped by verified enrollment and a published
 * course version, in the canonical learning-activity service.
 */
export const learningActivitySessions = pgTable("learning_activity_sessions", {
  id: id(),
  accessSessionId: uuid("access_session_id").notNull().references(() => accessSessions.id, { onDelete: "restrict" }),
  studentProfileId: uuid("student_profile_id").notNull().references(() => studentProfiles.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "restrict" }),
  courseTemplateVersionId: uuid("course_template_version_id").notNull().references(() => courseTemplateVersions.id, { onDelete: "restrict" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
  lastForeground: boolean("last_foreground").default(false).notNull(),
  lastLessonId: text("last_lesson_id"),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  estimatedActiveMs: integer("estimated_active_ms").default(0).notNull(),
  createdAt: createdAt(),
}, table => [
  index("learning_activity_sessions_student_started_idx").on(table.studentProfileId, table.startedAt),
  index("learning_activity_sessions_section_idx").on(table.sectionId, table.studentProfileId),
  check("learning_activity_sessions_active_nonnegative", sql`${table.estimatedActiveMs} >= 0`),
]);

/**
 * Interaction evidence is append-only; authoritative grades, completions and
 * attendance remain in their existing domain tables.
 */
export const learningActivityEvents = pgTable("learning_activity_events", {
  id: id(),
  learningSessionId: uuid("learning_session_id").notNull().references(() => learningActivitySessions.id, { onDelete: "restrict" }),
  studentProfileId: uuid("student_profile_id").notNull().references(() => studentProfiles.id, { onDelete: "restrict" }),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "restrict" }),
  courseTemplateVersionId: uuid("course_template_version_id").notNull().references(() => courseTemplateVersions.id, { onDelete: "restrict" }),
  lessonId: text("lesson_id").notNull(),
  resourceId: text("resource_id"),
  kind: text("kind").notNull(),
  clientEventId: uuid("client_event_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  estimatedActiveMs: integer("estimated_active_ms").default(0).notNull(),
}, table => [
  uniqueIndex("learning_activity_events_client_uq").on(table.learningSessionId, table.clientEventId),
  index("learning_activity_events_student_time_idx").on(table.studentProfileId, table.receivedAt),
  index("learning_activity_events_section_time_idx").on(table.sectionId, table.receivedAt),
  check("learning_activity_events_active_nonnegative", sql`${table.estimatedActiveMs} >= 0`),
]);
