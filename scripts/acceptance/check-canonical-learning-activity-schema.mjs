#!/usr/bin/env node
/**
 * Read-only schema acceptance gate for canonical learning-session evidence.
 * Run against an explicitly selected NONPRODUCTION Neon branch after applying
 * patch-learning-session-activity.sql. It never changes database records.
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
        AND table_name IN ('learning_sessions','learning_session_events')
    `),
    pool.query(`
      SELECT conname FROM pg_constraint
      WHERE connamespace = 'education_v30'::regnamespace
        AND conname IN (
          'canonical_learning_sessions_attempt_version_fk',
          'canonical_learning_events_session_attempt_fk',
          'canonical_learning_events_dedupe_uq'
        )
    `),
    pool.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'education_v30'
        AND indexname IN (
          'canonical_learning_sessions_live_idx',
          'canonical_learning_sessions_id_attempt_uq',
          'canonical_learning_events_attempt_time_idx'
        )
    `),
    pool.query(`
      SELECT c.relname, c.relrowsecurity FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='education_v30'
        AND c.relname IN ('learning_sessions','learning_session_events')
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
  ];
  for(const name of required) assert(present.has(name), `Missing canonical evidence column: ${name}`);
  const constraintSet = new Set(constraints.rows.map(row => row.conname));
  for(const name of [
    "canonical_learning_sessions_attempt_version_fk",
    "canonical_learning_events_session_attempt_fk",
    "canonical_learning_events_dedupe_uq",
  ]) assert(constraintSet.has(name), `Missing canonical activity constraint: ${name}`);
  const indexSet = new Set(indexes.rows.map(row => row.indexname));
  for(const name of [
    "canonical_learning_sessions_live_idx",
    "canonical_learning_sessions_id_attempt_uq",
    "canonical_learning_events_attempt_time_idx",
  ]) assert(indexSet.has(name), `Missing evidence index: ${name}`);
  assert.equal(security.rows.length,2,"Expected two session evidence tables");
  assert(security.rows.every(row=>row.relrowsecurity===true),"Row security must be enabled");
  console.log("Canonical learning-session schema verified (read-only).");
} finally {
  await pool.end();
}
