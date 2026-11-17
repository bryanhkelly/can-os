#!/usr/bin/env node
/**
 * Read-only CAN -> canonical Site staff release preflight.
 * Checks installed schema and relationship readiness without inferring or
 * granting identity links, and without printing identities or credentials.
 *
 * DATABASE_URL=<target database> npm run db:canonical:staff-readiness
 * This is a schema/operator readiness check, NOT proof that a particular
 * user has a verified mapping or that the restricted login can SET ROLE.
 */
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for read-only readiness verification");
const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 3000 });
let client;
try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  const [{ staff_reader, person_link_table, site_link_table, native_grants_table, operators_table }] =
    (await client.query(`
      SELECT
        to_regprocedure('education_v30.v301_can_staff_session_context(text)') IS NOT NULL AS staff_reader,
        to_regclass('public.access_account_canonical_principals') IS NOT NULL AS person_link_table,
        to_regclass('public.site_canonical_identity_links') IS NOT NULL AS site_link_table,
        to_regclass('education_v30.canonical_account_grants') IS NOT NULL AS native_grants_table,
        to_regclass('education_v30.site_organization_roles') IS NOT NULL AS operators_table
    `)).rows;
  const checks = { staff_reader, person_link_table, site_link_table, native_grants_table, operators_table };
  const missing = Object.entries(checks).filter(([, present]) => !present).map(([name]) => name);
  if (missing.length) {
    await client.query("ROLLBACK");
    console.error("FAIL: canonical staff infrastructure is incomplete: " + missing.join(", "));
    console.error("Apply the reviewed additive CAN staff migrations before any live acceptance run.");
    process.exitCode = 1;
  } else {
    const [counts] = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.access_account_canonical_principals
          WHERE revoked_at IS NULL AND verified_at IS NOT NULL) AS verified_person_links,
        (SELECT count(*)::int FROM public.site_canonical_identity_links
          WHERE status = 'approved' AND confirmed_at IS NOT NULL AND reviewed_at IS NOT NULL) AS approved_site_links,
        (SELECT count(*)::int FROM education_v30.canonical_account_grants
          WHERE active = true AND revoked_at IS NULL AND role_code IN ('site_admin','registrar')) AS active_staff_grants,
        (SELECT count(*)::int FROM education_v30.site_organization_roles
          WHERE role_code IN ('operator','host')
            AND valid_from <= now() AND (valid_through IS NULL OR valid_through > now())) AS active_site_relationships
    `)).rows;
    await client.query("ROLLBACK");
    const ready = Object.values(counts).every(value => Number(value) > 0);
    console.log(JSON.stringify({ infrastructure: "present", ...counts, acceptance_ready: ready }, null, 2));
    if (!ready) {
      console.error("FAIL: no end-to-end canonical staff path is available. Do not auto-create or approve identity links.");
      process.exitCode = 1;
    } else {
      console.log("PASS: staff infrastructure and at least one relationship candidate exist.");
      console.log("NEXT: separately verify exact account, Person, Site and grant using authorized reviewer actions,");
      console.log("then run a real same-session Blueprint authoring test. Counts alone do not grant access.");
    }
  }
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  console.error("FAIL: canonical staff readiness could not be verified:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
