#!/usr/bin/env node
/**
 * Executable rollback-only database integration tests for the adult noncredit
 * self-enrollment journey. The fixture exists ONLY on an isolated test01
 * branch. This is not browser-based email verification or Playwright.
 *
 * APP_ENV=test CAN_TEST_DB_WRITES_ENABLED=true \
 * TEST_DATABASE_URL=postgresql://... \
 * npm run db:canonical:noncredit:integration
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { assertIsolatedTestDatabaseTarget } from "../isolated-test-db-guard.mjs";

if (existsSync(".env.local")) loadEnvFile(".env.local");
function fail(message) {
  throw new Error("Noncredit QA refused: " + message);
}
if (process.env.APP_ENV !== "test") fail("APP_ENV=test required");
const { testUrl } = assertIsolatedTestDatabaseTarget({
  env: process.env,
  fail,
  allowDatabaseUrlFallback: false,
});
function splitSql(source) {
  // Handles single/double quotes, escaped SQL quotes and tagged $$ DO blocks.
  // The entire script is under this runner's transaction and is always rolled back.
  const withoutComments = source.replace(/^\s*--[^\n]*$/gm, "");
  const statements = [];
  let current = "", quoted = null, dollar = null;
  for (let i = 0; i < withoutComments.length; i++) {
    const ch = withoutComments[i];
    if (dollar) {
      if (withoutComments.startsWith(dollar, i)) {
        current += dollar;
        i += dollar.length - 1;
        dollar = null;
      } else current += ch;
      continue;
    }
    if (quoted) {
      current += ch;
      if (ch === quoted) {
        if (withoutComments[i + 1] === quoted) {
          current += withoutComments[++i];
        } else quoted = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quoted = ch;
      current += ch;
    } else if (ch === "$") {
      const found = withoutComments.slice(i).match(/^\$[a-zA-Z0-9_]*\$/);
      if (found) {
        dollar = found[0];
        current += dollar;
        i += dollar.length - 1;
      } else current += ch;
    } else if (ch === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  if (quoted || dollar) fail("Malformed SQL: unfinished quoted text");
  return statements.filter(text => !["BEGIN", "COMMIT", "SAVEPOINT enrollment_qa",
    "ROLLBACK TO SAVEPOINT enrollment_qa"].includes(text));
}

const fixtureSql = readFileSync(
  "database/canonical/v3.0.1/accept-noncredit-self-enrollment-test01.sql", "utf8",
);
const pool = new Pool({ connectionString: testUrl, max: 1 });
const client = await pool.connect();
let metrics = null;
try {
  await client.query("BEGIN");
  // The sample is intentionally not real learning content. A provider must
  // create actual instruction and real consent copy before enabling a pilot.
  const { rows: fixtures } = await client.query(`
    SELECT r.id,r.delivery_mode
    FROM education_v30.noncredit_self_enrollment_releases r
    INNER JOIN education_v30.organizations org
      ON org.id=r.registering_organization_id
    WHERE r.id::text LIKE 'aa230000-%'
      AND org.metadata->>'qa_only'='true'
      AND org.metadata->>'intended_branch'='test01'
      AND r.status='published' AND r.opens_at<=now()
      AND r.closes_at>now()
    ORDER BY r.id
  `);
  assert.equal(fixtures.length, 2, "Expected two open TEST ONLY releases on test01");
  assert.deepEqual(fixtures.map(row => row.delivery_mode),
    ["independent", "facilitated"]);
  await client.query("SAVEPOINT enrollment_qa");
  for (const statement of splitSql(fixtureSql)) {
    const result = await client.query(statement);
    if (result.rows.some(row => row.check === "qa_happy_and_denied_paths")) {
      metrics = result.rows[0];
    }
  }
  assert.ok(metrics, "Rollback suite did not emit its outcome metrics");
  assert.equal(Number(metrics.accepted_claims), 3);
  assert.equal(Number(metrics.registrations), 3);
  assert.equal(Number(metrics.withdrawn), 1);
  assert.equal(Number(metrics.withdrawn_attempts), 1);
  await client.query("ROLLBACK TO SAVEPOINT enrollment_qa");
  const { rows: remaining } = await client.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM education_v30.noncredit_registrations
        WHERE id::text LIKE 'aa340000-%') AS registrations,
      (SELECT COUNT(*)::integer FROM education_v30.noncredit_self_enrollment_claims
        WHERE id::text LIKE 'aa380000-%') AS claims,
      (SELECT COUNT(*)::integer FROM public.access_accounts
        WHERE email_normalized LIKE 'qa-learner-%@example.invalid') AS accounts
  `);
  assert.deepEqual(remaining[0], { registrations: 0, claims: 0, accounts: 0 },
    "Rollback must remove every synthetic learner/claim/account");
  console.log("PASS: independent + Site A enrollment; wrong Site, wrong consent, mismatched");
  console.log("      native identity and over-capacity denied; withdrawal kept consent/seat.");
  console.log("PASS: all synthetic learner data rolled back, source releases untouched.");
  await client.query("ROLLBACK");
} catch (error) {
  try { await client.query("ROLLBACK"); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
