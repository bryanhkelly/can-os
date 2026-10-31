/**
 * FullFlow persistent multi-role browser acceptance runner
 * (contract: docs/full-flow-acceptance-contract.md).
 *
 * Target: the pinned isolated FullFlow Neon branch (TEST_DATABASE_URL) only.
 * The pinned branch guards run before any browser session is allowed to write:
 *   1. scripts/run-integration-tests.mjs full-flow --preflight
 *      (offline endpoint isolation: TEST_DATABASE_URL/CAN_TEST_DB_WRITES_ENABLED)
 *   2. scripts/verify-fullflow-neon-branch.mjs
 *      (pinned FullFlow branch id/name against the Neon API)
 *   3. scripts/verify-fullflow-schema.mjs
 *      (48 applied migrations plus required FullFlow tables/columns)
 *
 * The journey boots its own app server on the dedicated localhost:3189 port,
 * uses synthetic fullflow-* identities, a disposable local access-mail outbox,
 * and revokes every session it created during teardown.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "node:process";

if (existsSync(".env.local")) {
  loadEnvFile(".env.local");
}

function run(step, command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`FullFlow browser acceptance stopped: ${step} failed.`);
    process.exit(result.status ?? 1);
  }
}

// 1. Shared offline endpoint-isolation preflight (identical to the FullFlow
//    integration suite entrypoint).
run("endpoint isolation preflight", process.execPath, [
  "scripts/run-integration-tests.mjs",
  "full-flow",
  "--preflight",
]);
if (process.argv.includes("--preflight")) {
  process.exit(0);
}

// 2 + 3. Pinned FullFlow Neon branch identity and schema guards (read-only;
// they require CAN_TEST_DB_WRITES_ENABLED=true enforced by the preflight).
run("pinned FullFlow Neon branch guard", process.execPath, [
  "scripts/verify-fullflow-neon-branch.mjs",
]);
run("pinned FullFlow schema guard", process.execPath, [
  "scripts/verify-fullflow-schema.mjs",
]);

const accessMailOutboxDir = mkdtempSync(join(tmpdir(), "can-os-fullflow-access-mail-"));
let result;
try {
  result = spawnSync(process.execPath, [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config=playwright.fullflow.config.ts",
    ...process.argv.slice(2),
  ], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      CAN_APPLICATION_DB_HOST: process.env.CAN_APPLICATION_DB_HOST
        ?? new URL(process.env.DATABASE_URL).hostname,
      APP_ENV: "test",
      NODE_ENV: "test",
      CAN_TEST_DB_WRITES_ENABLED: "true",
      PLAYWRIGHT_BASE_URL: "http://localhost:3189",
      CAN_ACCESS_TOKEN_PEPPER: "fullflow-e2e-pepper-0123456789abcdef0",
      CAN_JOB_SECRET: "fullflow-e2e-job-secret-0123456789",
      CAN_ACCESS_PUBLIC_ORIGIN: "https://app.can-os.test",
      CAN_ACCESS_MAIL_OUTBOX_DIR: accessMailOutboxDir,
      CAN_DEMO_WRITES_ENABLED: "true",
      CAN_R2_LIVE_UPLOADS_ENABLED: "false",
      CAN_R2_DEMO_UPLOADS_ENABLED: "false",
    },
  });
} finally {
  rmSync(accessMailOutboxDir, { recursive: true, force: true });
}
if (result?.error) throw result.error;
process.exit(result?.status ?? 1);
