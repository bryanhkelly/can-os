#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { endpoint } from "./isolated-test-db-guard.mjs";
import { verifyRecordedInstructorNeonBranch } from "./verify-recorded-instructor-neon-branch.mjs";

async function main() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  if (process.env.APP_ENV !== "test" || process.env.NODE_ENV === "production") {
    throw new Error("Recorded-instructor acceptance requires APP_ENV=test outside production.");
  }
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("Set TEST_DATABASE_URL to an isolated test database.");
  const fail = (message) => { throw new Error(message); };
  const testHost = endpoint(testUrl, fail);
  if (process.env.DATABASE_URL && testHost === endpoint(process.env.DATABASE_URL, fail)) {
    throw new Error("TEST_DATABASE_URL must not be the application database.");
  }
  if (process.env.CAN_APPLICATION_DB_HOST &&
      testHost === process.env.CAN_APPLICATION_DB_HOST.replace(/-pooler(?=\.)/, "")) {
    throw new Error("TEST_DATABASE_URL must not be the application host.");
  }

  const sql = readFileSync(resolve("scripts/acceptance/recorded-instructor-readiness.sql"), "utf8");
  const pool = new Pool({ connectionString: testUrl, max: 1 });
  const client = await pool.connect();
  let schemaReady = false;
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await verifyRecordedInstructorNeonBranch(client);
    const { rows } = await client.query(sql);
    if (rows.length !== 10) throw new Error("Recorded-instructor readiness returned an incomplete contract.");
    for (const row of rows) {
      console.log(`${row.passed === true ? "PASS" : "FAIL"} [${row.category}] ${row.check_name}`);
    }
    const failed = rows.filter(row => row.passed !== true);
    console.log(`Recorded-instructor readiness: ${rows.length - failed.length}/${rows.length} passed.`);
    if (failed.length) {
      process.exitCode = 1;
    } else {
      schemaReady = true;
    }
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
  if (!schemaReady) return;

  // Schema policies alone are insufficient: prove two restricted learner
  // principals can read only their own course, progress, and practice.
  const result = spawnSync(process.execPath,
    ["scripts/acceptance/check-instructional-learner-isolation.mjs"],
    { stdio: "inherit", env: process.env },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
