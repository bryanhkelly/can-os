#!/usr/bin/env node
/**
 * Restricted-role acceptance for the canonical two-learner, one-Section contract.
 *
 * Requires a seeded, isolated test database and two actual restricted login
 * credentials. It never uses owner permissions or writes test data.
 *
 * APP_ENV=test
 * TEST_DATABASE_URL=...                       (endpoint comparison only)
 * CAN_INSTRUCTIONAL_LEARNER_A_DATABASE_URL=...
 * CAN_INSTRUCTIONAL_LEARNER_B_DATABASE_URL=...
 * CAN_INSTRUCTIONAL_LEARNER_A_ATTEMPT_ID=...
 * CAN_INSTRUCTIONAL_LEARNER_B_ATTEMPT_ID=...
 */
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { endpoint } from "../isolated-test-db-guard.mjs";

if (existsSync(".env.local")) loadEnvFile(".env.local");

function fail(reason) { throw new Error(reason); }
function requireValue(name) {
  const value = process.env[name];
  if (!value) fail(`Missing ${name}.`);
  return value;
}
function assert(condition, reason) {
  if (!condition) fail(reason);
}
async function readVisible(client, table, field, attemptId) {
  const { rows } = await client.query(
    `SELECT ${field} FROM ${table} WHERE course_attempt_id=$1`,
    [attemptId],
  );
  return rows;
}
async function run() {
  assert(process.env.APP_ENV === "test" && process.env.NODE_ENV !== "production",
    "Instructional isolation acceptance requires APP_ENV=test outside production.");
  const ownerUrl = requireValue("TEST_DATABASE_URL");
  const urls = ["A", "B"].map(letter =>
    requireValue(`CAN_INSTRUCTIONAL_LEARNER_${letter}_DATABASE_URL`));
  const attempts = ["A", "B"].map(letter =>
    requireValue(`CAN_INSTRUCTIONAL_LEARNER_${letter}_ATTEMPT_ID`));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert(attempts.every(value => uuid.test(value)) && attempts[0] !== attempts[1],
    "Two distinct canonical Course attempt IDs are required.");

  const owner = new URL(ownerUrl);
  const testHost = endpoint(ownerUrl, fail);
  if (process.env.DATABASE_URL) {
    assert(testHost !== endpoint(process.env.DATABASE_URL, fail),
      "The learner acceptance database must differ from the application database.");
  }
  if (process.env.CAN_APPLICATION_DB_HOST) {
    assert(testHost !== process.env.CAN_APPLICATION_DB_HOST.replace(/-pooler(?=\\.)/, ""),
      "The learner acceptance database must differ from the application host.");
  }
  for (const url of urls) {
    const candidate = new URL(url);
    assert(endpoint(url, fail) === testHost && candidate.pathname === owner.pathname,
      "Both learner logins must use the exact isolated test database.");
    assert(candidate.username !== owner.username,
      "Learner credentials must not use the schema-owner login.");
  }

  const pools = urls.map(connectionString =>
    new Pool({ connectionString, max: 1 }));
  const clients = [];
  try {
    for (const pool of pools) {
      const client = await pool.connect();
      clients.push(client);
      await client.query("BEGIN TRANSACTION READ ONLY");
    }
    const contexts = [];
    for (const client of clients) {
      const { rows } = await client.query(`
        SELECT current_user AS db_role, r.rolsuper, r.rolbypassrls,
               r.rolinherit, r.rolcanlogin,
               pg_has_role(r.oid,
                 (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),
                 'MEMBER') AS is_schema_owner_member
        FROM pg_roles r WHERE r.rolname=current_user
      `);
      assert(rows.length === 1 && rows[0].rolcanlogin &&
        !rows[0].rolsuper && !rows[0].rolbypassrls &&
        !rows[0].is_schema_owner_member,
        "Only restricted, non-owner database principals may pass acceptance.");
      contexts.push(rows[0].db_role);
    }
    assert(contexts[0] !== contexts[1],
      "Learners must resolve to independently restricted database principals.");

    const own = [];
    const selectedTracks = [];
    for (let i=0; i<2; i++) {
      const other = 1-i;
      const client = clients[i];
      const { rows: visibleAttempts } = await client.query(`
        SELECT id,section_id,course_version_id
        FROM education_v30.learner_course_attempts WHERE id=ANY($1::uuid[])
      `, [[attempts[i], attempts[other]]]);
      assert(visibleAttempts.length === 1 && visibleAttempts[0].id === attempts[i],
        "Each restricted learner must see their own Course attempt, never the other learner.");
      own.push(visibleAttempts[0]);

      const { rows: ownSelections } = await client.query(`
        SELECT track_version_id FROM education_v30.learner_track_selections
        WHERE course_attempt_id=$1 AND superseded_at IS NULL
      `, [attempts[i]]);
      const otherSelections = await readVisible(client,
        "education_v30.learner_track_selections", "id",
        attempts[other]);
      assert(ownSelections.length === 1 && otherSelections.length === 0,
        "Each learner must have exactly one private active recorded instructor.");
      selectedTracks.push(ownSelections[0].track_version_id);

      const ownProgress = await readVisible(client,
        "education_v30.learner_lesson_progress", "lesson_id", attempts[i]);
      const otherProgress = await readVisible(client,
        "education_v30.learner_lesson_progress", "lesson_id", attempts[other]);
      assert(ownProgress.length >= 1 && otherProgress.length === 0,
        "Canonical lesson progress must stay learner-private.");

      const ownPractice = await readVisible(client,
        "education_v30.formative_practice_attempts", "id", attempts[i]);
      const otherPractice = await readVisible(client,
        "education_v30.formative_practice_attempts", "id", attempts[other]);
      assert(ownPractice.length >= 1 && otherPractice.length === 0,
        "Practice history must stay learner-private.");

      const { rows: ownAnswers } = await client.query(`
        SELECT r.practice_attempt_id
        FROM education_v30_secure.formative_practice_responses r
        JOIN education_v30.formative_practice_attempts p
          ON p.id=r.practice_attempt_id
        WHERE p.course_attempt_id=$1
      `, [attempts[i]]);
      assert(ownAnswers.length >= 1,
        "Each learner must be able to review their own saved practice answers.");

      console.log(`PASS: restricted learner ${i+1} sees only their Course, recorded selections, and practice.`);
    }
    assert(own[0].section_id && own[0].section_id === own[1].section_id &&
      own[0].course_version_id === own[1].course_version_id,
      "Both learners must belong to the same canonical Section and Course version.");
    assert(selectedTracks[0] !== selectedTracks[1],
      "The two learners must be independently using different recorded instructors.");
    console.log("PASS: same Section, different recorded instructors, isolated progress and practice.");
  } finally {
    for (const client of clients) {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    await Promise.all(pools.map(pool => pool.end()));
  }
}
run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode=1;
});
