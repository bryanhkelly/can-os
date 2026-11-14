#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { assertIsolatedTestDatabaseTarget } from "./isolated-test-db-guard.mjs";

if (existsSync(".env.local")) loadEnvFile(".env.local");
if (process.env.APP_ENV !== "test") {
  throw new Error("Canonical demo seeding requires APP_ENV=test.");
}
const { testUrl } = assertIsolatedTestDatabaseTarget({
  env: process.env,
  fail(message) { throw new Error(`Canonical demo seed refused: ${message}`); },
});
const issueArg = process.argv.slice(2).find(arg => arg.startsWith("--issue-session="));
const email = issueArg?.slice("--issue-session=".length) ?? null;
const allowed = new Set([
  "valor.admin@can.example",
  "barton.admin@can.example",
  "valor.reviewer@can.example",
  "barton.reviewer@can.example",
]);
if (email && !allowed.has(email)) {
  throw new Error("Only accounts provided by the native canonical demo fixture may receive a test session.");
}
const pepper = process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER;
if (email && (!pepper || pepper.length < 32)) {
  throw new Error("CAN_CANONICAL_ACCESS_TOKEN_PEPPER (32+ characters) is required for demo session issuance.");
}
const seed = readFileSync(resolve("database/canonical/v3.0.1/seed-canonical-demo.sql"), "utf8");
const pool = new Pool({ connectionString: testUrl, max: 1 });
const client = await pool.connect();
let secret = null;
try {
  await client.query("BEGIN");
  const schema = await client.query("SELECT to_regnamespace('education_v30') IS NOT NULL AS installed");
  if (!schema.rows[0]?.installed) {
    throw new Error("Install canonical schema.sql into the isolated test database first.");
  }
  await client.query(seed);
  const count = await client.query(`
    SELECT (SELECT count(*) FROM education_v30.canonical_accounts
      WHERE email_normalized LIKE '%@can.example')::integer AS accounts,
      (SELECT count(*) FROM education_v30.canonical_account_grants
      WHERE account_id IN (SELECT id FROM education_v30.canonical_accounts
      WHERE email_normalized LIKE '%@can.example'))::integer AS grants
  `);
  if (count.rows[0]?.accounts !== 4 || count.rows[0]?.grants !== 4) {
    throw new Error("Expected exactly four native canonical demo accounts and grants.");
  }
  if (email) {
    const records = await client.query(`
      SELECT a.id AS account_id, g.id AS grant_id
      FROM education_v30.canonical_accounts a
      JOIN education_v30.canonical_account_grants g ON g.account_id=a.id
      WHERE a.email_normalized=$1 AND a.email_verified_at IS NOT NULL
        AND a.disabled_at IS NULL AND g.active AND g.revoked_at IS NULL
    `, [email]);
    if (records.rowCount !== 1) {
      throw new Error("Demo session requires exactly one active native canonical grant.");
    }
    secret = randomBytes(32).toString("base64url");
    const secretHash = createHash("sha256")
      .update(pepper).update(":").update(secret).digest("hex");
    await client.query(`
      INSERT INTO education_v30.canonical_sessions
       (account_id,active_grant_id,secret_hash,expires_at)
      VALUES ($1,$2,$3,clock_timestamp()+interval '12 hours')
    `, [records.rows[0].account_id, records.rows[0].grant_id, secretHash]);
  }
  await client.query("COMMIT");
  console.log("Seeded four native canonical demo accounts across two independent Sites.");
  if (secret) {
    console.log("LOCAL TEST SESSION ONLY. Set this secure cookie in your test browser:");
    console.log(`__Host-can_os_v3_session=${secret}`);
    console.log("This token expires after twelve hours or thirty minutes of inactivity.");
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
