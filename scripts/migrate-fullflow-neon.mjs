import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import { verifyFullFlowNeonBranch } from "./verify-fullflow-neon-branch.mjs";

/**
 * The ONLY approved migration command for the FullFlow disposable Neon branch.
 * Requires online, read-only confirmation of Postgres-reported project + branch
 * identity before handing its verified connection string to Drizzle.
 * --preflight verifies without applying SQL.
 */
if (existsSync(".env.local")) loadEnvFile(".env.local");
if (process.env.NODE_ENV === "production" ||
    process.env.CAN_TEST_DB_WRITES_ENABLED !== "true") {
  throw new Error("Refusing FullFlow migrations outside an explicitly enabled nonproduction test environment.");
}
if (!process.env.CAN_APPLICATION_DB_HOST ||
    !/^[a-z0-9.-]+$/i.test(process.env.CAN_APPLICATION_DB_HOST)) {
  throw new Error("CAN_APPLICATION_DB_HOST is required as an additional application endpoint guard.");
}
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is required.");
const host = new URL(testUrl).hostname.replace(/-pooler(?=\.)/, "").toLowerCase();
if (host === process.env.CAN_APPLICATION_DB_HOST.trim().replace(/-pooler(?=\.)/, "").toLowerCase()) {
  throw new Error("Refusing migrations against the application database endpoint.");
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== testUrl) {
  const appHost = new URL(process.env.DATABASE_URL).hostname.replace(/-pooler(?=\.)/, "").toLowerCase();
  if (host === appHost) throw new Error("Refusing migrations against the application DATABASE_URL endpoint.");
}
// Never apply a journal tip that lacks its Drizzle snapshot: drizzle-kit
// generate would otherwise infer a synthetic catch-up migration.
const migrationJournal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const migrationTip = migrationJournal.entries.at(-1);
if (!migrationTip || !existsSync(`drizzle/meta/${String(migrationTip.idx).padStart(4, "0")}_snapshot.json`)) {
  throw new Error(`Refusing FullFlow migration: journal tip ${migrationTip?.tag ?? "(empty)"} lacks its reviewed Drizzle snapshot.`);
}
await verifyFullFlowNeonBranch(testUrl);
// Even on the correct branch, Drizzle must not silently continue from a
// partially applied or manually altered schema. Inspect the committed journal
// against the reviewed prior ledger and the current additive migration.
const review = spawnSync(process.execPath, ["scripts/review-fullflow-migrations.mjs"], {
  stdio: "inherit", env: process.env,
});
if (review.error) throw review.error;
if (review.status !== 0) {
  throw new Error("Dedicated FullFlow migration preconditions changed; no SQL was applied.");
}
if (process.argv.includes("--preflight")) {
  console.log("Verified FullFlow branch and migration preconditions; no SQL applied.");
  process.exit(0);
}
if (process.argv.slice(2).length) {
  throw new Error("Unrecognized migration argument. Use --preflight or no additional arguments.");
}
// Historical drift on the retained E2E branch remains unapproved for writes.
// A generic test-write flag never authorizes applying SQL. Require explicit
// reviewed migration approval tied to the checked-out commit.
const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
if (gitHead.status !== 0 || !/^[a-f0-9]{40}$/.test(gitHead.stdout.trim()) ||
    process.env.CAN_FULLFLOW_MIGRATION_APPROVED_SHA !== gitHead.stdout.trim()) {
  throw new Error("HOLD: reviewed exact-SHA migration authorization missing; no SQL applied.");
}
// The repo's existing Drizzle migration command is reused, not bypassed.
const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "db:migrate"], {
  stdio: "inherit",
  env: {
    ...process.env, DATABASE_URL: testUrl, APP_ENV: "test", NODE_ENV: "test",
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
