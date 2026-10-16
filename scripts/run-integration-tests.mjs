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
if (process.env.DATABASE_URL && testEndpoint === endpoint(process.env.DATABASE_URL)) {
  fail("TEST_DATABASE_URL must not use the application database endpoint.");
}

const gf26Only = process.argv[2] === "gf26";
const suite = gf26Only ? ["tests/integration/gf26-fixture-integrity.test.ts"] : ["tests/integration"];
const args = gf26Only ? process.argv.slice(3) : process.argv.slice(2);
const result = spawnSync(process.execPath, [
  "node_modules/vitest/vitest.mjs", "run", ...suite, ...args,
], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl, APP_ENV: "test", NODE_ENV: "test" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
