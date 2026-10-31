import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { DATABASE_URL, TEST_ACCESS_TOKEN_PEPPER, TEST_JOB_SECRET, baseURL } from "./tests/e2e/env";

/**
 * Persistent multi-role FullFlow browser acceptance (contract:
 * docs/full-flow-acceptance-contract.md). The journey runs only against the
 * pinned isolated FullFlow Neon branch via the guarded script entrypoint
 * (node scripts/run-fullflow-e2e.mjs); this config refuses every other target.
 */
if (
  !DATABASE_URL ||
  DATABASE_URL !== process.env.TEST_DATABASE_URL ||
  process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  baseURL !== "http://localhost:3189"
) {
  throw new Error(
    "FullFlow browser tests require the guarded TEST_DATABASE_URL, CAN_TEST_DB_WRITES_ENABLED=true, test APP_ENV/NODE_ENV, and the dedicated localhost:3189 app. Use node scripts/run-fullflow-e2e.mjs.",
  );
}
const testHost = (() => {
  try {
    return new URL(DATABASE_URL).hostname;
  } catch {
    return null;
  }
})();
const applicationHost = process.env.CAN_APPLICATION_DB_HOST ?? null;
if (!applicationHost || !testHost || testHost === applicationHost) {
  throw new Error(
    "FullFlow browser tests require distinct TEST_DATABASE_URL and CAN_APPLICATION_DB_HOST targets.",
  );
}
const accessMailOutboxDir = process.env.CAN_ACCESS_MAIL_OUTBOX_DIR;
if (!accessMailOutboxDir) {
  throw new Error(
    "FullFlow browser tests require CAN_ACCESS_MAIL_OUTBOX_DIR for the local student sign-in link handoff.",
  );
}

// Do not rely solely on the npm wrapper: direct Playwright launches must
// verify the pinned FullFlow Neon branch before creating any fixture rows.
execFileSync(process.execPath, ["scripts/verify-fullflow-neon-branch.mjs"], {
  stdio: "inherit", env: process.env,
});
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "full-flow.spec.ts",
  timeout: 600_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: {
    command: "npm run dev -- --host localhost --port 3189 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL,
      CAN_ACCESS_TOKEN_PEPPER: TEST_ACCESS_TOKEN_PEPPER,
      CAN_JOB_SECRET: TEST_JOB_SECRET,
      CAN_ACCESS_PUBLIC_ORIGIN: "https://app.can-os.test",
      CAN_ACCESS_MAIL_OUTBOX_DIR: accessMailOutboxDir,
      APP_ENV: "test",
      NODE_ENV: "test",
      CAN_TEST_DB_WRITES_ENABLED: "true",
      CAN_DEMO_WRITES_ENABLED: "true",
      CAN_R2_LIVE_UPLOADS_ENABLED: "false",
      CAN_R2_DEMO_UPLOADS_ENABLED: "false",
    },
  },
});
