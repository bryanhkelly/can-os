import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { assertIsolatedTestDatabaseTarget } from "./isolated-test-db-guard.mjs";

// This project is the CAN OS Neon deployment, not a caller-supplied claim.
// Explicitly refuse the default production branch even if a CI variable
// accidentally names it as the expected test branch.
export const ADMISSIONS_NEON_PROJECT_ID = "sweet-hall-62441909";
export const ADMISSIONS_PRODUCTION_BRANCH_ID = "br-restless-sea-ar9ooo55";

export function assertExpectedAdmissionsBranchId(expectedBranchId) {
  if (!expectedBranchId || !/^br-[a-z0-9-]+$/.test(expectedBranchId) ||
      expectedBranchId === ADMISSIONS_PRODUCTION_BRANCH_ID) {
    throw new Error("Admissions acceptance requires an explicit nonproduction CAN_ADMISSIONS_TEST_BRANCH_ID.");
  }
}

export function assertAdmissionsNeonIdentity(identity, expectedBranchId) {
  assertExpectedAdmissionsBranchId(expectedBranchId);
  if (!identity || identity.project_id !== ADMISSIONS_NEON_PROJECT_ID ||
      identity.branch_id !== expectedBranchId ||
      identity.branch_id === ADMISSIONS_PRODUCTION_BRANCH_ID) {
    throw new Error("Admissions acceptance refused: Postgres-attested Neon project/branch differs from the approved isolated test branch.");
  }
}

export async function verifyAdmissionsNeonBranch(env = process.env) {
  if (env.APP_ENV !== "test") {
    throw new Error("Admissions branch verification requires APP_ENV=test.");
  }
  if (!env.CAN_APPLICATION_DB_HOST) {
    throw new Error("Admissions branch verification requires the production CAN_APPLICATION_DB_HOST comparison.");
  }
  const { testUrl } = assertIsolatedTestDatabaseTarget({
    env,
    fail(message) { throw new Error(message); },
  });
  // Fail closed on missing/misconfigured branch declarations BEFORE opening
  // any connection. Hostname inequality alone is not proof of branch identity.
  assertExpectedAdmissionsBranchId(env.CAN_ADMISSIONS_TEST_BRANCH_ID);
  const sql = neon(testUrl);
  const [identity] = await sql`
    SELECT current_setting('neon.project_id', true) AS project_id,
           current_setting('neon.branch_id', true) AS branch_id
  `;
  assertAdmissionsNeonIdentity(identity, env.CAN_ADMISSIONS_TEST_BRANCH_ID);
  return identity;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  verifyAdmissionsNeonBranch().then(() => {
    console.log("Verified nonproduction admissions Neon branch identity (read-only).");
  }).catch(error => {
    console.error(error instanceof Error ? error.message : "Admissions Neon identity verification failed.");
    process.exitCode = 1;
  });
}
