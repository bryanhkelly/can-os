import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";

if (existsSync(".env.local")) loadEnvFile(".env.local");
const preflight = spawnSync(process.execPath, [
  "scripts/run-integration-tests.mjs", "admissions-offers", "--preflight",
], { stdio: "inherit" });
if (preflight.error) throw preflight.error;
if (preflight.status !== 0) process.exit(preflight.status ?? 1);
if (process.argv.includes("--preflight")) process.exit(0);

// Browser acceptance must independently verify the actual nonproduction Neon
// branch, not merely trust the provided test database URL.
const branchCheck = spawnSync(process.execPath, ["scripts/verify-admissions-neon-branch.mjs"], {
  stdio: "inherit", env: process.env,
});
if (branchCheck.error) throw branchCheck.error;
if (branchCheck.status !== 0) process.exit(branchCheck.status ?? 1);

const accessMailOutboxDir = mkdtempSync(join(tmpdir(), "can-os-access-mail-"));
let result;
try {
  result = spawnSync(process.execPath, [
    "node_modules/@playwright/test/cli.js", "test", "--config=playwright.admissions.config.ts", ...process.argv.slice(2),
  ], {
    stdio: "inherit",
    env: {
      ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL,
      CAN_APPLICATION_DB_HOST: process.env.CAN_APPLICATION_DB_HOST ?? new URL(process.env.DATABASE_URL).hostname,
      APP_ENV: "test", NODE_ENV: "test", PLAYWRIGHT_BASE_URL: "http://localhost:3187",
      CAN_ACCESS_TOKEN_PEPPER: "admissions-e2e-pepper-0123456789abcdef",
      CAN_ACCESS_PUBLIC_ORIGIN: "https://app.can-os.test",
      CAN_ACCESS_MAIL_OUTBOX_DIR: accessMailOutboxDir,
      CAN_DEMO_WRITES_ENABLED: "true",
      CAN_R2_LIVE_UPLOADS_ENABLED: "false", CAN_R2_DEMO_UPLOADS_ENABLED: "false",
    },
  });
} finally {
  rmSync(accessMailOutboxDir, { recursive: true, force: true });
}
if (result?.error) throw result.error;
process.exit(result?.status ?? 1);
