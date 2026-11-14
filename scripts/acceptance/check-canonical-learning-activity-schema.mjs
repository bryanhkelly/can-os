#!/usr/bin/env node
/**
 * Read-only schema acceptance gate for canonical learning-session evidence.
 * Run against an explicitly selected NONPRODUCTION Neon branch after applying
 * both patch-learning-session-activity.sql and patch-facilitated-learning.sql.
 * It never changes database records.
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

if (process.env.CAN_ACTIVITY_SCHEMA_VALIDATION !== "1") {
  throw new Error("Set CAN_ACTIVITY_SCHEMA_VALIDATION=1 and select an isolated database explicitly.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const [columns, constraints, indexes, security] = await Promise.all([
    pool.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'education_v30'
        AND table_name IN ('learning_sessions','learning_session_events',
                       'facilitated_learning_sessions','facilitated_learning_participants',
                       'facilitated_learning_playback')
    `),
    pool.query(`
      SELECT conname FROM pg_constraint
      WHERE connamespace = 'education_v30'::regnamespace
        AND conname IN (
          'canonical_learning_sessions_attempt_version_fk',
          'canonical_learning_events_session_attempt_fk',
          'canonical_learning_events_dedupe_uq',
          'facilitated_sessions_lifecycle_ck',
          'facilitated_playback_session_course_fk',
          'facilitated_participant_session_attempt_uq',
          'facilitated_playback_request_uq'
        )
    `),
    pool.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'education_v30'
        AND indexname IN (
          'canonical_learning_sessions_live_idx',
          'canonical_learning_sessions_id_attempt_uq',
          'canonical_learning_events_attempt_time_idx',
          'facilitated_sessions_code_digest_uq',
          'facilitated_sessions_site_time_idx',
          'facilitated_participant_attempt_idx',
          'facilitated_playback_recent_idx'
        )
    `),
    pool.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
        (SELECT count(*) FROM pg_policies p WHERE p.schemaname='education_v30'
          AND p.tablename=c.relname
          AND p.policyname='learning_evidence_owner_only') AS owner_policies,
        (SELECT count(*) FROM aclexplode(
          coalesce(c.relacl,acldefault('r',c.relowner))) grant_row
          WHERE grant_row.grantee=0) AS public_grants
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='education_v30'
        AND c.relname IN ('learning_sessions','learning_session_events',
          'facilitated_learning_sessions','facilitated_learning_participants',
          'facilitated_learning_playback')
    `),
  ]);
  const present = new Set(columns.rows.map(row => `${row.table_name}.${row.column_name}`));
  const required = [
    "learning_sessions.id","learning_sessions.course_attempt_id",
    "learning_sessions.course_version_id","learning_sessions.access_session_id",
    "learning_sessions.client_instance_id","learning_sessions.participant_person_id",
    "learning_sessions.state","learning_sessions.last_interaction_at",
    "learning_sessions.estimated_active_ms","learning_sessions.ended_at",
    "learning_session_events.learning_session_id","learning_session_events.course_attempt_id",
    "learning_session_events.client_event_id","learning_session_events.request_digest",
    "learning_session_events.kind","learning_session_events.received_at",
    "learning_session_events.estimated_active_ms",
    "facilitated_learning_sessions.id", "facilitated_learning_sessions.deployment_id",
    "facilitated_learning_sessions.course_version_id", "facilitated_learning_sessions.site_id",
    "facilitated_learning_sessions.facilitator_person_id",
    "facilitated_learning_sessions.pairing_code_digest",
    "facilitated_learning_sessions.pairing_expires_at",
    "facilitated_learning_participants.facilitated_session_id",
    "facilitated_learning_participants.course_attempt_id",
    "facilitated_learning_participants.participant_person_id",
    "facilitated_learning_playback.facilitated_session_id",
    "facilitated_learning_playback.course_version_id",
    "facilitated_learning_playback.request_id",
    "facilitated_learning_playback.kind",
  ];
  for(const name of required) assert(present.has(name), `Missing canonical evidence column: ${name}`);
  const constraintSet = new Set(constraints.rows.map(row => row.conname));
  for(const name of [
    "canonical_learning_sessions_attempt_version_fk",
    "canonical_learning_events_session_attempt_fk",
    "canonical_learning_events_dedupe_uq",
    "facilitated_sessions_lifecycle_ck",
    "facilitated_playback_session_course_fk",
    "facilitated_participant_session_attempt_uq",
    "facilitated_playback_request_uq",
  ]) assert(constraintSet.has(name), `Missing canonical activity constraint: ${name}`);
  const indexSet = new Set(indexes.rows.map(row => row.indexname));
  for(const name of [
    "canonical_learning_sessions_live_idx",
    "canonical_learning_sessions_id_attempt_uq",
    "canonical_learning_events_attempt_time_idx",
    "facilitated_sessions_code_digest_uq",
    "facilitated_sessions_site_time_idx",
    "facilitated_participant_attempt_idx",
    "facilitated_playback_recent_idx",
  ]) assert(indexSet.has(name), `Missing evidence index: ${name}`);
  assert.equal(security.rows.length,5,"Expected five canonical learning evidence tables");
  assert(security.rows.every(row=>row.relrowsecurity===true &&
    row.relforcerowsecurity===true),"Forced row security must be enabled on all five tables");
  assert(security.rows.every(row=>Number(row.owner_policies)===1),
    "Only explicit owner-only release-gate policies may exist");
  assert(security.rows.every(row=>Number(row.public_grants)===0),
    "Learning evidence must have no PUBLIC table permissions");
  console.log("Canonical and facilitated learning evidence schemas verified (read-only).");
} finally {
  await pool.end();
}
