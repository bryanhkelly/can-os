import { boolean, check, index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { educationV30 } from "./core";
import { learnerCourseAttempts, courseVersions } from "./learning";

/** Non-authoritative participation evidence. Authentication and academic outcomes remain separate. */
export const canonicalLearningSessions = educationV30.table("learning_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseAttemptId: uuid("course_attempt_id").notNull().references(() => learnerCourseAttempts.id, { onDelete: "restrict" }),
  courseVersionId: uuid("course_version_id").notNull().references(() => courseVersions.id, { onDelete: "restrict" }),
  accessSessionId: uuid("access_session_id").notNull(),
  participantPersonId: uuid("participant_person_id").notNull(),
  state: text("state").$type<"active" | "paused" | "ended">().notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
  lastForeground: boolean("last_foreground").notNull().default(false),
  lastLessonId: uuid("last_lesson_id"),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  estimatedActiveMs: integer("estimated_active_ms").notNull().default(0),
}, t => [
  index("canonical_learning_sessions_attempt_idx").on(t.courseAttemptId, t.startedAt),
  uniqueIndex("canonical_learning_sessions_live_idx").on(t.courseAttemptId, t.accessSessionId).where(sql`${t.endedAt} IS NULL`),
  check("canonical_learning_sessions_duration_chk", sql`${t.estimatedActiveMs} >= 0`),
  check("canonical_learning_sessions_end_chk", sql`(${t.endedAt} IS NULL AND ${t.state} <> 'ended') OR (${t.endedAt} IS NOT NULL AND ${t.state} = 'ended')`),
]);

/** Append-only, deduplicated client observations. Never proves attendance, grades or credit. */
export const canonicalLearningEvents = educationV30.table("learning_session_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  learningSessionId: uuid("learning_session_id").notNull().references(() => canonicalLearningSessions.id, { onDelete: "restrict" }),
  courseAttemptId: uuid("course_attempt_id").notNull().references(() => learnerCourseAttempts.id, { onDelete: "restrict" }),
  clientEventId: uuid("client_event_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  kind: text("kind").notNull(),
  lessonId: uuid("lesson_id"),
  resourceId: text("resource_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  estimatedActiveMs: integer("estimated_active_ms").notNull().default(0),
}, t => [
  uniqueIndex("canonical_learning_events_dedupe_uq").on(t.learningSessionId, t.clientEventId),
  index("canonical_learning_events_attempt_time_idx").on(t.courseAttemptId, t.receivedAt),
  check("canonical_learning_events_duration_chk", sql`${t.estimatedActiveMs} >= 0`),
]);
