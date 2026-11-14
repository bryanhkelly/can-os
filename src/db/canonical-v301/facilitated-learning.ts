import { check, index, integer, text, timestamp, uniqueIndex, uuid, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { educationV30 } from "./core";
import { learnerCourseAttempts, courseVersions } from "./learning";
import { programDeployments } from "./blueprints";
import { catalogSites } from "./catalog";

/**
 * Facilitator-controlled delivery: one in-room screen, many independently
 * registered learners. This is not a classroom Section or official attendance.
 */
export const facilitatedLearningSessions = educationV30.table("facilitated_learning_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  deploymentId: uuid("deployment_id").notNull().references(() => programDeployments.id),
  courseVersionId: uuid("course_version_id").notNull().references(() => courseVersions.id),
  siteId: uuid("site_id").notNull().references(() => catalogSites.id),
  hostOrganizationId: uuid("host_organization_id").notNull(),
  facilitatorPersonId: uuid("facilitator_person_id").notNull(),
  state: text("state").$type<"live" | "ended">().notNull().default("live"),
  pairingCodeDigest: text("pairing_code_digest").notNull(),
  pairingExpiresAt: timestamp("pairing_expires_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, t => [
  index("facilitated_sessions_site_time_idx").on(t.siteId, t.startedAt),
  index("facilitated_sessions_deployment_time_idx").on(t.deploymentId, t.startedAt),
  uniqueIndex("facilitated_sessions_code_digest_uq").on(t.pairingCodeDigest),
  uniqueIndex("facilitated_sessions_id_course_uq").on(t.id, t.courseVersionId),
  check("facilitated_sessions_lifecycle_ck", sql`(${t.state} = 'live' AND ${t.endedAt} IS NULL) OR (${t.state} = 'ended' AND ${t.endedAt} IS NOT NULL)`),
]);

/** Self-pairing only proves that an authenticated course learner joined a room. */
export const facilitatedLearningParticipants = educationV30.table("facilitated_learning_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  facilitatedSessionId: uuid("facilitated_session_id").notNull().references(() => facilitatedLearningSessions.id),
  courseAttemptId: uuid("course_attempt_id").notNull().references(() => learnerCourseAttempts.id),
  participantPersonId: uuid("participant_person_id").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  lastPairedAt: timestamp("last_paired_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
}, t => [
  uniqueIndex("facilitated_participant_session_attempt_uq").on(t.facilitatedSessionId, t.courseAttemptId),
  index("facilitated_participant_attempt_idx").on(t.courseAttemptId),
]);

/** Controls from the host screen. Do not copy them to learner grades or watch time. */
export const facilitatedLearningPlayback = educationV30.table("facilitated_learning_playback", {
  id: uuid("id").defaultRandom().primaryKey(),
  facilitatedSessionId: uuid("facilitated_session_id").notNull().references(() => facilitatedLearningSessions.id),
  courseVersionId: uuid("course_version_id").notNull().references(() => courseVersions.id),
  lessonId: uuid("lesson_id").notNull(),
  assetVersionId: uuid("asset_version_id").notNull(),
  facilitatorPersonId: uuid("facilitator_person_id").notNull(),
  requestId: uuid("request_id").notNull(),
  kind: text("kind").$type<"opened" | "played" | "paused" | "ended">().notNull(),
  positionSeconds: integer("position_seconds"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("facilitated_playback_request_uq").on(t.facilitatedSessionId, t.requestId),
  index("facilitated_playback_recent_idx").on(t.facilitatedSessionId, t.occurredAt),
  foreignKey({columns:[t.facilitatedSessionId,t.courseVersionId],foreignColumns:[facilitatedLearningSessions.id,facilitatedLearningSessions.courseVersionId],name:"facilitated_playback_session_course_fk"}),
  check("facilitated_playback_position_ck", sql`${t.positionSeconds} IS NULL OR (${t.positionSeconds} >= 0 AND ${t.positionSeconds} <= 43200)`),
]);


/** Bounded global per-person pairing attempts, no raw failed codes retained. */
export const facilitatedPairingRateLimits = educationV30.table("facilitated_pairing_rate_limits", {
  participantPersonId: uuid("participant_person_id").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  attemptCount: integer("attempt_count").notNull().default(0),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("facilitated_pair_limit_updated_idx").on(t.updatedAt),
  check("facilitated_pair_limit_count_ck", sql`${t.attemptCount} >= 0 AND ${t.attemptCount} <= 7`),
]);
