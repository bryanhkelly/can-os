import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.DATABASE_URL !== databaseUrl ||
    process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
    process.env.APP_ENV !== "test" || process.env.NODE_ENV !== "test" ||
    !process.env.CAN_APPLICATION_DB_HOST) {
  throw new Error("Authenticated route smoke tests require the guarded disposable test database and explicit test flags.");
}

const baseURL = process.env.PLAYWRIGHT_AUTHENTICATED_ROUTES_BASE_URL ?? "http://localhost:3191";
const target = new URL(baseURL);
if (target.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
  throw new Error("Authenticated route smoke tests require a localhost application URL.");
}

execFileSync(process.execPath, ["scripts/verify-admissions-neon-branch.mjs"], {
  stdio: "inherit",
  env: {
    ...process.env,
    CAN_ADMISSIONS_TEST_BRANCH_ID: process.env.CAN_ADMISSIONS_TEST_BRANCH_ID ??
      process.env.CAN_E2E_TEST_BRANCH_ID,
  },
});

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "my-activity.spec.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: `npm run dev -- --host ${target.hostname} --port ${target.port || "3191"} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      APP_ENV: "test",
      NODE_ENV: "test",
      CAN_TEST_DB_WRITES_ENABLED: "true",
      CAN_ACCESS_TOKEN_PEPPER: process.env.CAN_ACCESS_TOKEN_PEPPER ?? "route-smoke-pepper-0123456789abcdef0",
      CAN_JOB_SECRET: process.env.CAN_JOB_SECRET ?? "route-smoke-job-secret",
    },
  },
});