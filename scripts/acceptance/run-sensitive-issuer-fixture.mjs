#!/usr/bin/env node
/**
 * Explicitly opt-in, rollback-only positive issuer-authorization acceptance.
 * This is NOT a production migration or issuance test.
 *
 * CAN_ISSUER_ACCEPTANCE_TEST=1
 * CAN_ISSUER_ACCEPTANCE_DATABASE_URL=<isolated test01 connection>
 * node scripts/acceptance/run-sensitive-issuer-fixture.mjs
 *
 * The exact Neon project + test01 branch are checked before any SQL writes.
 * A distinct URL is required when DATABASE_URL is configured.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const TEST01="br-bitter-feather-ar0u63x7";
const enabled=process.env.CAN_ISSUER_ACCEPTANCE_TEST;
const connectionString=process.env.CAN_ISSUER_ACCEPTANCE_DATABASE_URL;
if(enabled!=="1" || !connectionString) {
  throw new Error("Require explicit CAN_ISSUER_ACCEPTANCE_TEST=1 and isolated acceptance DB URL");
}
if(process.env.DATABASE_URL && connectionString===process.env.DATABASE_URL)
  throw new Error("Acceptance URL must not be the normal DATABASE_URL");

const fixture=readFileSync(
  "database/canonical/v3.0.1/accept-sensitive-credential-issuer-test01.sql",
  "utf8",
);
assert.match(fixture,/^-- Rollback-only issuer-approval acceptance/);
assert.match(fixture,/\bBEGIN;\s*SAVEPOINT can_staff_sso_accept;/);
assert.match(fixture,/ROLLBACK TO SAVEPOINT can_staff_sso_accept;/);
assert.match(fixture,/ROLLBACK;\s*$/);

const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:3000});
const client=await pool.connect();
let attempted=false;
try {
  const [identity]=(await client.query(`
    SELECT current_setting('neon.project_id',true) AS project,
      current_setting('neon.branch_id',true) AS branch
  `)).rows;
  assert.equal(identity?.project,PROJECT,"Wrong Neon project");
  assert.equal(identity?.branch,TEST01,
    "Refusing to mutate any database except isolated Neon test01");
  const [objects]=(await client.query(`
    SELECT
      to_regprocedure('education_v30.v301_can_staff_session_context(text)')
        IS NOT NULL AS staff_reader,
      to_regprocedure('education_v30.v301_can_sensitive_capability(text,text)')
        IS NOT NULL AS sensitive_reader,
      to_regclass('education_v30.canonical_sensitive_capability_approvals')
        IS NOT NULL AS approvals
  `)).rows;
  assert.equal(objects?.staff_reader,true);
  assert.equal(objects?.sensitive_reader,true);
  assert.equal(objects?.approvals,true);

  // Fail rather than collide with any previously retained synthetic data.
  const [before]=(await client.query(`
    SELECT count(*)::int AS n FROM public.access_accounts
    WHERE id IN ('faab0000-0000-4000-8000-000000000001',
      'faab0000-0000-4000-8000-000000000009')
  `)).rows;
  assert.equal(before?.n,0,"Synthetic acceptance IDs already exist");

  attempted=true;
  // Pg simple query protocol accepts this trusted transaction script as a
  // single text command. The SQL itself explicitly rolls back its fixtures.
  await client.query(fixture);

  const [after]=(await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.access_accounts
       WHERE id IN ('faab0000-0000-4000-8000-000000000001',
        'faab0000-0000-4000-8000-000000000009')) AS accounts,
      (SELECT count(*)::int
       FROM education_v30.canonical_sensitive_capability_approvals
       WHERE requested_by_can_account_id IN
         ('faab0000-0000-4000-8000-000000000001',
          'faab0000-0000-4000-8000-000000000009')) AS approvals
  `)).rows;
  assert.equal(after?.accounts,0,"Synthetic acceptance accounts leaked");
  assert.equal(after?.approvals,0,"Synthetic issuer approvals leaked");
  console.log("PASS: issuer authority, expiry, session revocation, account binding and cleanup");
} catch (err) {
  if(attempted) {
    try {await client.query("ROLLBACK")} catch {}
  }
  throw err;
} finally {
  client.release();
  await pool.end();
}
