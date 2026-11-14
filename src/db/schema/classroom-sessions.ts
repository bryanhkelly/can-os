import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";
import { sites } from "./organizations";

/**
 * Classroom Connect sessions: one shared-screen classroom occurrence with
 * paired learner devices. Lifecycle states follow the Phase 2 pilot spec
 * (docs/product/classroom-connect-phase-2-pilot.md §6); status columns use
 * typed text (not pgEnum) so lifecycle states can evolve without type churn.
 */

export const classroomSessions = pgTable("classroom_sessions", {
  id: id(),
  // Nullable while pre-session site/program configuration (spec §4.1) is
  // intentionally out of scope for the first pairing slice. When set,
  // server-side join eligibility checks enrollment at this site.
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  status: text("status").$type<"scheduled" | "open" | "ended" | "cancelled">()
    .notNull().default("scheduled"),
  facilitatorPersonId: uuid("facilitator_person_id").notNull()
    .references(() => people.id, { onDelete: "restrict" }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  index("classroom_session_site_idx").on(t.siteId),
  index("classroom_session_status_idx").on(t.status),
]);

export const classroomJoinTokens = pgTable("classroom_join_tokens", {
  id: id(),
  sessionId: uuid("session_id").notNull()
    .references(() => classroomSessions.id, { onDelete: "cascade" }),
  // Short-lived public code. Identifies access to a session; never carries
  // identity, attendance or private data (spec §4.2).
  code: text("code").notNull(),
  status: text("status").$type<"active" | "rotated" | "revoked">()
    .notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Failed join attempts against this token; crossing the domain threshold
  // revokes it so a probed code cannot be brute-forced open.
  failedAttempts: integer("failed_attempts").notNull().default(0),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("classroom_join_token_code_uq").on(t.code),
  index("classroom_join_token_session_idx").on(t.sessionId, t.status),
]);

// Stable membership per learner per session, independent of the learner's
// changing device connections (spec §7.3: one participant, 0..many connections).
export const classroomSessionParticipants = pgTable("classroom_session_participants", {
  id: id(),
  sessionId: uuid("session_id").notNull()
    .references(() => classroomSessions.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("classroom_session_participant_uq").on(t.sessionId, t.personId),
  index("classroom_session_participant_person_idx").on(t.personId),
]);

// Ephemeral device connection. Reconnects create new connection rows against
// the same participant; they never duplicate membership or attendance.
export const classroomSessionConnections = pgTable("classroom_session_connections", {
  id: id(),
  participantId: uuid("participant_id").notNull()
    .references(() => classroomSessionParticipants.id, { onDelete: "cascade" }),
  // Opaque client-provided device reference (no device fingerprinting).
  deviceKey: text("device_key").notNull(),
  // Idempotency: retrying the same join never creates a second participant.
  idempotencyKey: text("idempotency_key").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("classroom_connection_idempotency_uq").on(t.idempotencyKey),
  index("classroom_connection_participant_idx").on(t.participantId),
]);
