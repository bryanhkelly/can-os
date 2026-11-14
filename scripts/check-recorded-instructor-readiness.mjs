#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { endpoint } from "./isolated-test-db-guard.mjs";

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
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const { rows } = await client.query(sql);
    if (rows.length !== 9) throw new Error("Recorded-instructor readiness returned an incomplete contract.");
    for (const row of rows) {
      console.log(`${row.passed === true ? "PASS" : "FAIL"} [${row.category}] ${row.check_name}`);
    }
    const failed = rows.filter(row => row.passed !== true);
    console.log(`Recorded-instructor readiness: ${rows.length - failed.length}/${rows.length} passed.`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
