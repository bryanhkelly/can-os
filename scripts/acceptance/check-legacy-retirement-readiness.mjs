#!/usr/bin/env node
/**
 * Read-only retirement evidence, not an account or academic-data migration.
 *
 * Run ONLY against isolated test01:
 * CAN_RETIREMENT_QA=1 CAN_RETIREMENT_QA_DATABASE_URL=... \
 *   node scripts/acceptance/check-legacy-retirement-readiness.mjs
 *
 * Never deletes Section or canonical identity records. A zero count is
 * necessary but not sufficient: historical FKs and audit retention must also
 * be reconciled before data removal.
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

assert.equal(process.env.CAN_RETIREMENT_QA, "1",
  "Explicit CAN_RETIREMENT_QA=1 required");
assert(process.env.CAN_RETIREMENT_QA_DATABASE_URL,
  "Isolated test01 CAN_RETIREMENT_QA_DATABASE_URL is required");
const pool = new Pool({
  connectionString: process.env.CAN_RETIREMENT_QA_DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 3000,
});
const tableQueries = {
  legacy_sections: "SELECT count(*)::bigint AS n FROM public.sections",
  legacy_section_teachers: "SELECT count(*)::bigint AS n FROM public.section_teachers",
  legacy_section_enrollments: "SELECT count(*)::bigint AS n FROM public.enrollments WHERE section_id IS NOT NULL",
  legacy_section_assessments: "SELECT count(*)::bigint AS n FROM public.assessments WHERE section_id IS NOT NULL",
  legacy_section_submissions: "SELECT count(*)::bigint AS n FROM public.submissions s JOIN public.assessments a ON a.id=s.assessment_id WHERE a.section_id IS NOT NULL",
  native_classes: "SELECT count(*)::bigint AS n FROM education_v30.classes",
  native_courses: "SELECT count(*)::bigint AS n FROM education_v30.courses",
  native_course_versions: "SELECT count(*)::bigint AS n FROM education_v30.course_versions",
  legacy_distinct_section_course_versions: "SELECT count(DISTINCT course_template_version_id)::bigint AS n FROM public.sections",
  legacy_distinct_section_profiles: "SELECT count(DISTINCT student_profile_id)::bigint AS n FROM public.enrollments WHERE section_id IS NOT NULL",
  native_class_enrollments: "SELECT count(*)::bigint AS n FROM education_v30.class_enrollments",
  identity_links_noncredit: "SELECT count(*)::bigint AS n FROM public.access_account_noncredit_principals",
  identity_links_staff: "SELECT count(*)::bigint AS n FROM public.access_account_canonical_principals",
  can_accounts: "SELECT count(*)::bigint AS n FROM public.access_accounts",
  can_people: "SELECT count(*)::bigint AS n FROM public.people",
  native_people: "SELECT count(*)::bigint AS n FROM education_v30.persons",
  native_accounts: "SELECT count(*)::bigint AS n FROM education_v30.canonical_accounts",
};
const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  const {rows:[target]} = await client.query(
    "SELECT current_setting('neon.project_id',true) AS project_id, " +
    "current_setting('neon.branch_id',true) AS branch_id",
  );
  assert.equal(target?.project_id, "sweet-hall-62441909",
    "Not the reviewed CAN OS Neon project");
  assert.equal(target?.branch_id, "br-bitter-feather-ar0u63x7",
    "BLOCKED: retirement inspection must use test01, never production");
  const counts = {};
  const missing = [];
  for (const [name, query] of Object.entries(tableQueries)) {
    try {
      // A savepoint allows reporting absent legacy tables without poisoning
      // the read-only transaction.
      await client.query("SAVEPOINT count_one");
      const {rows} = await client.query(query);
      counts[name] = Number(rows[0]?.n ?? 0);
      assert(Number.isSafeInteger(counts[name]), "Invalid aggregate: " + name);
      await client.query("RELEASE SAVEPOINT count_one");
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT count_one");
      await client.query("RELEASE SAVEPOINT count_one");
      // Only missing-table (42P01) is a supported optional count; do not
      // silently suppress permissions failures or missing columns.
      if (error?.code !== "42P01") throw error;
      counts[name] = null;
      missing.push(name);
    }
  }
  // Enumerate every FK referencing legacy Sections. Hardcoded counts above
  // are only the known core records; future features must not bypass cutover
  // simply because they added a new Section relationship.
  const { rows: dependencies } = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name,
           a.attname AS column_name
    FROM pg_constraint fk
    JOIN pg_class c ON c.oid=fk.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN unnest(fk.conkey) AS cols(column_number) ON TRUE
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=cols.column_number
    WHERE fk.contype='f'
      AND fk.confrelid='public.sections'::regclass
    ORDER BY 1,2,3
  `);
  const dependentRows = [];
  for (const row of dependencies) {
    const parts = [row.schema_name, row.table_name, row.column_name];
    if (parts.some(part => !/^[a-z_][a-z0-9_]*$/.test(part)))
      throw new Error("Unsafe database identifier in retirement evidence");
    const [schema, table, column] = parts;
    const { rows } = await client.query(
      `SELECT count(*)::bigint AS n FROM "${schema}"."${table}" WHERE "${column}" IS NOT NULL`);
    dependentRows.push({
      table: schema+"."+table, column, linkedRecords: Number(rows[0]?.n ?? 0),
    });
  }
  const blockingDependents = dependentRows.filter(row => row.linkedRecords > 0);
  const blockingLegacy = [
    "legacy_sections", "legacy_section_teachers",
    "legacy_section_enrollments", "legacy_section_assessments",
    "legacy_section_submissions",
  ].filter(name => counts[name] !== null && counts[name] !== 0);
  const dualIdentity = ["identity_links_noncredit", "identity_links_staff"]
    .filter(name => counts[name] !== null && counts[name] !== 0);
  const result = {
    target: "test01", counts, missing, blockingLegacy, dualIdentity,
    dependentRows, blockingDependents,
    sectionRetirementReady: blockingLegacy.length === 0 && blockingDependents.length === 0 && missing.length === 0,
    singleIdentityConsolidationReady: dualIdentity.length === 0 && missing.length === 0,
    note: "Aggregate preflight only. It does not prove record-level migration, retention, RLS, or functional parity.",
  };
  console.log(JSON.stringify(result, null, 2));
  assert.equal(blockingLegacy.length, 0,
    "BLOCKED: Section records still need evidence-preserving migration");
  assert.equal(blockingDependents.length, 0,
    "BLOCKED: dependent Section foreign-key records require migration");
  assert.equal(dualIdentity.length, 0,
    "BLOCKED: dual-identity links still need reviewed consolidation");
  assert.equal(missing.length, 0, "BLOCKED: incomplete schema inspection");
  await client.query("ROLLBACK");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
