import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { DATABASE_URL, TEST_ACCESS_TOKEN_PEPPER, baseURL } from "./tests/e2e/env";

if (!DATABASE_URL || DATABASE_URL !== process.env.TEST_DATABASE_URL ||
    process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" || process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV !== "test" || baseURL !== "http://localhost:3187")
  throw new Error("Use node scripts/run-admissions-e2e.mjs with an isolated disposable test database.");
const testHost = new URL(DATABASE_URL).hostname.replace(/-pooler(?=\.)/, "").toLowerCase();
const applicationHost = process.env.CAN_APPLICATION_DB_HOST?.replace(/-pooler(?=\.)/, "").toLowerCase();
if (!applicationHost || testHost === applicationHost)
  throw new Error("Browser acceptance requires a different disposable database endpoint from the application.");
const accessMailOutboxDir = process.env.CAN_ACCESS_MAIL_OUTBOX_DIR;
if (!accessMailOutboxDir)
  throw new Error("Browser acceptance requires an isolated local access-mail outbox.");

// Guard direct Playwright invocation, not just the npm wrapper.
execFileSync(process.execPath, ["scripts/verify-admissions-neon-branch.mjs"], {
  stdio: "inherit", env: process.env,
});
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "admissions.spec.ts",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --host localhost --port 3187 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL, CAN_ACCESS_TOKEN_PEPPER: TEST_ACCESS_TOKEN_PEPPER,
      CAN_ACCESS_PUBLIC_ORIGIN: "https://app.can-os.test",
      CAN_ACCESS_MAIL_OUTBOX_DIR: accessMailOutboxDir,
      APP_ENV: "test", NODE_ENV: "test", CAN_DEMO_WRITES_ENABLED: "true",
      CAN_R2_LIVE_UPLOADS_ENABLED: "false", CAN_R2_DEMO_UPLOADS_ENABLED: "false",
    },
  },
});
