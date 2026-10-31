import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

/**
 * FullFlow integration/migration isolation is enforced by Postgres-reported
 * Neon identity, not a URL/hostname naming convention or caller-supplied label.
 * This file contains no credentials and never mutates the database.
 */
export const FULLFLOW_NEON_PROJECT_ID = "sweet-hall-62441909";
export const FULLFLOW_NEON_BRANCH_ID = "br-proud-pine-arfju8h2";

export function assertFullFlowNeonIdentity(identity) {
  if (!identity ||
      identity.project_id !== FULLFLOW_NEON_PROJECT_ID ||
      identity.branch_id !== FULLFLOW_NEON_BRANCH_ID) {
    throw new Error(
      "Database refused: FullFlow writes/tests require the dedicated " +
      "fullflow-e2e-20261022 Neon branch; production, test01 and other branches are forbidden.",
    );
  }
}

export async function verifyFullFlowNeonBranch(testUrl) {
  if (!testUrl) throw new Error("Missing TEST_DATABASE_URL for branch identity check.");
  // Postgres settings are returned by Neon itself. A user-provided environment
  // variable cannot impersonate the target project/branch.
  const query = neon(testUrl);
  const [identity] = await query`
    SELECT current_setting('neon.project_id', true) AS project_id,
           current_setting('neon.branch_id', true) AS branch_id
  `;
  assertFullFlowNeonIdentity(identity);
  return identity;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.CAN_TEST_DB_WRITES_ENABLED !== "true") {
    console.error("FullFlow branch verification requires CAN_TEST_DB_WRITES_ENABLED=true.");
    process.exitCode = 1;
  } else {
    verifyFullFlowNeonBranch(process.env.TEST_DATABASE_URL).then(() => {
      console.log("Verified dedicated FullFlow Neon branch identity (read-only).");
    }).catch(error => {
      console.error(error instanceof Error ? error.message : "FullFlow branch verification failed.");
      process.exitCode = 1;
    });
  }
}
