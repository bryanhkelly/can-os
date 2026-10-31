import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  DATABASE_URL,
  TEST_ACCESS_TOKEN_PEPPER,
  TEST_JOB_SECRET,
  baseURL,
} from "./tests/e2e/env";

// Dotenv-free: set DATABASE_URL in the shell (or via `node --env-file`), always
// pointing at a disposable Neon branch — never the production database.
if (!DATABASE_URL || DATABASE_URL !== process.env.TEST_DATABASE_URL ||
    process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
    process.env.APP_ENV !== "test" || process.env.NODE_ENV !== "test" ||
    !process.env.CAN_APPLICATION_DB_HOST) {
  throw new Error(
    "FullFlow browser tests require the guarded TEST_DATABASE_URL, " +
    "matching DATABASE_URL, explicit test environment and distinct application host.",
  );
}
const branchHost = new URL(DATABASE_URL).hostname.replace(/-pooler(?=\.)/, "").toLowerCase();
if (branchHost === process.env.CAN_APPLICATION_DB_HOST.replace(/-pooler(?=\.)/, "").toLowerCase()) {
  throw new Error("Browser tests must not use the application database endpoint.");
}
// Even a direct "npx playwright test" invocation must attest the actual
// nonproduction Neon project/branch before beforeAll fixtures can write.
execFileSync(process.execPath, ["scripts/verify-admissions-neon-branch.mjs"], {
  stdio: "inherit",
  env: { ...process.env,
    CAN_ADMISSIONS_TEST_BRANCH_ID:
      process.env.CAN_ADMISSIONS_TEST_BRANCH_ID ?? process.env.CAN_E2E_TEST_BRANCH_ID,
  },
});
export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: "admissions.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // The golden flow is a single sequential story against shared fixture rows.
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL,
      APP_ENV: "test", NODE_ENV: "test", CAN_TEST_DB_WRITES_ENABLED: "true",
      // Hashes the synthetic session secrets the fixture inserts.
      CAN_ACCESS_TOKEN_PEPPER: TEST_ACCESS_TOKEN_PEPPER,
      // Guards POST /api/jobs (markOverdueSubmissionsMissing + event worker).
      CAN_JOB_SECRET: TEST_JOB_SECRET,
      // Synthetic demo writes fail closed without this.
      CAN_DEMO_WRITES_ENABLED: "true",
    },
  },
});
