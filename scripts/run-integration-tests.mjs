import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";

if (existsSync(".env.local")) loadEnvFile(".env.local");

function fail(message) {
  console.error(`Integration tests refused: ${message}`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production") fail("never run fixtures in production.");
if (process.env.CAN_TEST_DB_WRITES_ENABLED !== "true") {
  fail("set CAN_TEST_DB_WRITES_ENABLED=true only for a disposable isolated database.");
}
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) fail("TEST_DATABASE_URL is required; DATABASE_URL is never used as a fallback.");

function endpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("a database connection string is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    fail("a PostgreSQL connection string is required.");
  }
  return url.hostname.replace(/-pooler(?=\.)/, "");
}

const testEndpoint = endpoint(testUrl);
const mode = process.argv[2];
if (mode === "admissions-offers" && !process.env.CAN_APPLICATION_DB_HOST && !process.env.DATABASE_URL) {
  fail("admissions acceptance requires CAN_APPLICATION_DB_HOST or DATABASE_URL for a production endpoint comparison.");
}
if (process.env.DATABASE_URL && testEndpoint === endpoint(process.env.DATABASE_URL)) {
  fail("TEST_DATABASE_URL must not use the application database endpoint.");
}
if (process.env.CAN_APPLICATION_DB_HOST) {
  const rawHost = process.env.CAN_APPLICATION_DB_HOST.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(rawHost) || rawHost.startsWith(".") || rawHost.endsWith(".")) {
    fail("CAN_APPLICATION_DB_HOST must be a hostname, not a URL or connection string.");
  }
  const applicationHost = rawHost.replace(/-pooler(?=\\.)/, "");
  if (testEndpoint.toLowerCase() === applicationHost) {
    fail("TEST_DATABASE_URL must not use the configured application database host.");
  }
}

if (process.argv.includes("--preflight")) {
  if (mode !== "admissions-offers") fail("preflight is only supported for admissions-offers.");
  console.log("Disposable admissions database endpoint check passed.");
  process.exit(0);
}

const targeted = mode === "gf26" || mode === "gf26-lifecycle" || mode === "admissions-offers";
const suite = mode === "gf26" ? ["tests/integration/gf26-fixture-integrity.test.ts"] : mode === "gf26-lifecycle" ? ["tests/integration/gf26-session-lifecycle.test.ts"] : mode === "admissions-offers" ? ["tests/integration/admissions-offers.integration.test.ts"] : ["tests/integration"];
const args = targeted ? process.argv.slice(3) : process.argv.slice(2);
const result = spawnSync(process.execPath, [
  "node_modules/vitest/vitest.mjs", "run", ...suite, ...args,
], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl, APP_ENV: "test", NODE_ENV: "test" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
