import { existsSync } from "node:fs";
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
if (process.env.DATABASE_URL) {
  const appHost = new URL(process.env.DATABASE_URL).hostname.replace(/-pooler(?=\.)/, "").toLowerCase();
  if (host === appHost) throw new Error("Refusing migrations against the application DATABASE_URL endpoint.");
}
await verifyFullFlowNeonBranch(testUrl);
if (process.argv.includes("--preflight")) {
  console.log("Verified FullFlow migration target; no SQL applied.");
  process.exit(0);
}
if (process.argv.slice(2).length) {
  throw new Error("Unrecognized migration argument. Use --preflight or no additional arguments.");
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
