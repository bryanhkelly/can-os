#!/usr/bin/env node
/**
 * Read-only restricted-role Blueprint acceptance preflight for an isolated
 * canonical test database. Does not create sessions, users, links or drafts.
 *
 * APP_ENV=test CAN_TEST_DB_WRITES_ENABLED=true\n * TEST_DATABASE_URL=<owner-url> DATABASE_URL=<production-url>
 * CAN_CANONICAL_TEST_APP_DATABASE_URL=<restricted-url>
 * node scripts/acceptance/check-test01-blueprint-roles.mjs
 *
 * CAN_TEST_DB_WRITES_ENABLED is required by the shared isolation guard,\n * although this script itself opens only a read-only transaction.\n * The test isolation guard must pass before opening the restricted URL.
 * Full draft/review/execution acceptance remains a separate rollback test.
 */
import { Pool } from "@neondatabase/serverless";
import { assertIsolatedTestDatabaseTarget, endpoint } from "../isolated-test-db-guard.mjs";

const fail = message => { throw new Error("Blueprint role preflight: " + message); };
if (process.env.APP_ENV !== "test") fail("APP_ENV=test is required");
const { testUrl } = assertIsolatedTestDatabaseTarget({ env: process.env, fail });
const appUrl = process.env.CAN_CANONICAL_TEST_APP_DATABASE_URL;
if (!appUrl) fail("restricted CAN_CANONICAL_TEST_APP_DATABASE_URL is required");
const owner = new URL(testUrl), app = new URL(appUrl);
if (endpoint(testUrl, fail) !== endpoint(appUrl, fail) ||
    owner.pathname !== app.pathname || owner.port !== app.port ||
    owner.username === app.username) {
  fail("restricted login must connect to the same isolated test database using a separate account");
}

const organization = "11110000-0000-4000-8000-000000000001";
const suffix = organization.replaceAll("-", "");
const authorRole = "can_v30_blueprint_author_" + suffix;
const reviewerRole = "can_v30_blueprint_reviewer_" + suffix;
const pool = new Pool({ connectionString: appUrl, max: 1, connectionTimeoutMillis: 3000 });
let client;
try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  const [login] = (await client.query(`
    SELECT current_user AS login,
      pg_has_role(current_user, $1, 'SET') AS can_set_author,
      pg_has_role(current_user, $2, 'SET') AS can_set_reviewer
  `, [authorRole, reviewerRole])).rows;
  if (!login?.can_set_author || !login?.can_set_reviewer) {
    fail("restricted test login lacks scoped Blueprint author/reviewer role selection");
  }

  const checks = [];
  for (const [purpose, role] of [["author", authorRole], ["reviewer", reviewerRole]]) {
    await client.query("SET LOCAL ROLE " + role);
    const [row] = (await client.query(`
      SELECT current_user AS role,
        has_table_privilege(current_user,'education_v30.canonical_sessions','SELECT') AS can_read_sessions,
        has_table_privilege(current_user,'education_v30.blueprint_configurations','INSERT') AS can_create,
        has_table_privilege(current_user,'education_v30.configuration_reviews','INSERT') AS can_review,
        has_table_privilege(current_user,'education_v30.program_deployments','UPDATE') AS can_activate,
        (SELECT count(*)::int FROM education_v30.sites WHERE id=$1) AS own_site,
        (SELECT count(*)::int FROM education_v30.sites WHERE id=$2) AS foreign_site
    `, ["22220000-0000-4000-8000-000000000001",
       "22220000-0000-4000-8000-000000000002"])).rows;
    if (row.role !== role || row.can_read_sessions || row.can_activate ||
        row.can_create !== (purpose === "author") ||
        row.can_review !== (purpose === "reviewer") ||
        (purpose === "author" && (row.own_site !== 1 || row.foreign_site !== 0))) {
      fail(purpose + " least-privilege boundary failed");
    }
    checks.push(purpose + ": exact-purpose SQL grants and session isolation");
  }
  await client.query("ROLLBACK");
  console.log("PASS: isolated Blueprint role readiness (" + checks.join("; ") + ")");
  console.log("NEXT: run rollback-only draft -> independent review -> planning Deployment acceptance.");
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client?.release();
  await pool.end();
}
