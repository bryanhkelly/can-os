import { defineConfig } from "@playwright/test";
import {
  DATABASE_URL,
  TEST_ACCESS_TOKEN_PEPPER,
  TEST_JOB_SECRET,
  baseURL,
} from "./tests/e2e/env";

// Dotenv-free: set DATABASE_URL in the shell (or via `node --env-file`), always
// pointing at a disposable Neon branch — never the production database.
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required for Playwright e2e tests. " +
      "Point it at a disposable Neon branch (never production), e.g. " +
      "DATABASE_URL=postgres://... npm run test:e2e",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
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
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      DATABASE_URL,
      // Hashes the synthetic session secrets the fixture inserts.
      CAN_ACCESS_TOKEN_PEPPER: TEST_ACCESS_TOKEN_PEPPER,
      // Guards POST /api/jobs (markOverdueSubmissionsMissing + event worker).
      CAN_JOB_SECRET: TEST_JOB_SECRET,
      // Synthetic demo writes fail closed without this.
      CAN_DEMO_WRITES_ENABLED: "true",
    },
  },
});
