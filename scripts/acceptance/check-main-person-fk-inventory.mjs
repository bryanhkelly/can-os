#!/usr/bin/env node
/**
 * Inventory the actual production Person FK graph without mutating it.
 *
 * CAN_MAIN_PERSON_FK_INVENTORY=1 DATABASE_URL=<CAN OS Neon main URL> \
 *   node scripts/acceptance/check-main-person-fk-inventory.mjs
 *
 * Use --details to print every referring table, column and FK constraint.
 * This is a schema/data inspection only. It never approves the cutover.
 */
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

assert.equal(process.env.CAN_MAIN_PERSON_FK_INVENTORY, "1",
  "Explicit CAN_MAIN_PERSON_FK_INVENTORY=1 required");
assert.ok(process.env.DATABASE_URL, "Missing main DATABASE_URL");
const sql = neon(process.env.DATABASE_URL);
const [target] = await sql`
 SELECT current_setting('neon.project_id',true) AS project,
        current_setting('neon.branch_id',true) AS branch,
        current_database() AS database
`;
assert.equal(target?.project, "sweet-hall-62441909", "Unexpected Neon project");
assert.equal(target?.branch, "br-restless-sea-ar9ooo55", "Refusing non-main branch");
assert.equal(target?.database, "neondb", "Unexpected database");

const constraints = await sql`
 SELECT
   n.nspname AS schema_name,
   t.relname AS table_name,
   a.attname AS person_column,
   c.conname AS constraint_name,
   c.convalidated AS validated,
   cardinality(c.conkey) AS source_columns,
   cardinality(c.confkey) AS target_columns,
   pg_get_constraintdef(c.oid) AS definition,
   t.relrowsecurity AS rls_enabled,
   t.relforcerowsecurity AS rls_forced
 FROM pg_constraint c
 JOIN pg_class t ON t.oid=c.conrelid
 JOIN pg_namespace n ON n.oid=t.relnamespace
 JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1]
 WHERE c.contype='f' AND c.confrelid='education_v30.persons'::regclass
 ORDER BY n.nspname,t.relname,c.conname
`;
const invalid = constraints.filter(row =>
  !row.validated || row.source_columns !== 1 || row.target_columns !== 1 ||
  !row.definition.includes("REFERENCES education_v30.persons(id)"));
const identifier = /^[a-z_][a-z0-9_]*$/;
const quote = value => {
  if (!identifier.test(value)) throw new Error("Unexpected identifier from catalog");
  return '"' + value + '"';
};

// Count non-null references by original FK column, without reading person IDs.
// This protects against NOT VALID constraints and surprising source records.
let references = 0;
const nonempty = [];
for (let i = 0; i < constraints.length; i += 20) {
  const batch = constraints.slice(i, i + 20);
  const query = batch.map((fk, index) => {
    const relation = quote(fk.schema_name)+"."+quote(fk.table_name);
    const column = quote(fk.person_column);
    return "SELECT "+(i+index)+" AS n, count(*)::int AS linked_rows "+
      "FROM "+relation+" WHERE "+column+" IS NOT NULL";
  }).join(" UNION ALL ");
  const rows = await sql.query(query);
  for (const row of rows) {
    references += row.linked_rows;
    if (row.linked_rows)
      nonempty.push({
        relation: constraints[row.n].schema_name+"."+constraints[row.n].table_name,
        column: constraints[row.n].person_column,
        rows: row.linked_rows,
      });
  }
}
const [identity] = await sql`
 SELECT
   (SELECT count(*)::int FROM education_v30.persons) AS native_people,
   (SELECT count(*)::int FROM education_v30.canonical_accounts) AS native_accounts,
   (SELECT count(*)::int FROM education_v30.canonical_sessions WHERE
      revoked_at IS NULL AND expires_at>now()) AS active_native_sessions,
   (SELECT count(*)::int FROM public.access_account_canonical_principals) AS staff_links,
   (SELECT count(*)::int FROM public.access_account_noncredit_principals) AS learner_links,
   (SELECT count(*)::int FROM public.access_adult_learning_reviews WHERE
      canonical_person_id IS NOT NULL) AS approved_review_links
`;
const bySchema = Object.fromEntries(
  [...new Set(constraints.map(row=>row.schema_name))].map(name=>[
    name, constraints.filter(row=>row.schema_name===name).length
  ])
);
const result = {
  target: "CAN OS Neon main", readOnly: true,
  constraints: constraints.length,
  referencingTables: new Set(constraints.map(row=>
    row.schema_name+"."+row.table_name)).size,
  bySchema, validated: constraints.length-invalid.length,
  invalidOrUnexpectedDefinitions: invalid.length,
  nonNullReferences: references, nonempty,
  rlsEnabledConstraints: constraints.filter(row=>row.rls_enabled).length,
  forcedRlsConstraints: constraints.filter(row=>row.rls_forced).length,
  identity,
  readyForFkRebindingPrerequisites:
    constraints.length>0 && invalid.length===0 && references===0 &&
    identity.native_people===0 && identity.native_accounts===0 &&
    identity.active_native_sessions===0 && identity.staff_links===0 &&
    identity.learner_links===0 && identity.approved_review_links===0,
  runtimeCutoverApproved: false,
  warning: "FK prereqs alone do NOT authorize DDL. Current functions, RLS, Class/learner/staff/guardian code and independent reviews must be migrated and verified together.",
  ...(process.argv.includes("--details") ? {constraints} : {}),
};
console.log(JSON.stringify(result,null,2));
if(invalid.length || references>0) process.exitCode=1;
