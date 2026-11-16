#!/usr/bin/env node
/**
 * WS4 read-only schema acceptance. Never changes database state.
 *
 * CAN_WS4_SCHEMA_VALIDATION=1 DATABASE_URL=<explicit disposable QA URL> \
 *   node scripts/acceptance/check-ws4-class-session-agenda.mjs
 *
 * Read-only introspection cannot prove per-person authorization or app-role
 * capabilities; execute negative SQL and authenticated browser cases separately.
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

if (process.env.CAN_WS4_SCHEMA_VALIDATION !== "1") {
  throw new Error("Explicit CAN_WS4_SCHEMA_VALIDATION=1 required");
}
if (!process.env.DATABASE_URL) {
  throw new Error("Select an explicit, independently reviewed QA DATABASE_URL");
}
const pool = new Pool({connectionString:process.env.DATABASE_URL});
const relation = "class_session_agenda_revisions";
const columns = [
  "id", "class_session_id", "course_version_id", "revision_no",
  "request_id", "items", "created_by_person_id", "created_at",
];
const requiredSource = [
  "classes", "class_sessions", "delivery_sessions",
  "facilitated_classroom_plans", "course_versions", "course_lessons",
  "official_course_assignment_versions", "assessment_versions",
];
try {
  const [tables, schema, indexes, triggers, constraints, policies] = await Promise.all([
    pool.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
       EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
         WHERE a.grantee=0) AS grants_public
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='education_v30' AND c.relname=ANY($1::text[])`,
       [[relation, ...requiredSource]]),
    pool.query(`SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_schema='education_v30' AND table_name=$1`,[relation]),
    pool.query(`SELECT indexname FROM pg_indexes
       WHERE schemaname='education_v30' AND tablename=$1`,[relation]),
    pool.query(`SELECT tgname, tgenabled FROM pg_trigger t
       JOIN pg_class c ON c.oid=t.tgrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='education_v30' AND c.relname=$1 AND NOT t.tgisinternal`,[relation]),
    pool.query(`SELECT conname, contype, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint WHERE conrelid=to_regclass($1)`,["education_v30."+relation]),
    pool.query(`SELECT policyname, roles, cmd FROM pg_policies
       WHERE schemaname='education_v30' AND tablename=$1`,[relation]),
  ]);
  const byName=new Map(tables.rows.map(row=>[row.relname,row]));
  for(const name of requiredSource)
    assert(byName.has(name),"Missing canonical prerequisite "+name);
  const table=byName.get(relation);
  assert(table,"Missing WS4 agenda table");
  assert(table.relrowsecurity && table.relforcerowsecurity,
    "WS4 agenda must force row-level security");
  assert(!table.grants_public,"PUBLIC access forbidden");
  const byColumn=new Map(schema.rows.map(row=>[row.column_name,row]));
  for(const name of columns) {
    const column=byColumn.get(name);
    assert(column,"Missing WS4 agenda column "+name);
    assert.equal(column.is_nullable,"NO","Required agenda column is nullable: "+name);
  }
  const indexNames=new Set(indexes.rows.map(row=>row.indexname));
  for(const name of [
    "class_session_agenda_revision_uq","class_session_agenda_request_uq",
    "class_session_agenda_history_idx",
  ])assert(indexNames.has(name),"Missing WS4 index "+name);
  assert(triggers.rows.some(row=>
    row.tgname==="canonical_class_session_agenda_guard_trg" &&
      row.tgenabled!=="D"),"Immutable agenda trigger missing or disabled");
  const fks=constraints.rows.filter(row=>row.contype==="f");
  assert(fks.length>=3,"Missing Class Session, Course version or Person FKs");
  assert.equal(policies.rows.length,1,"Expected exactly one owner-only RLS policy");
  assert.deepEqual(policies.rows[0].roles,["neondb_owner"],
    "Unreviewed direct application or PUBLIC policy");
  console.log("WS4 agenda schema, FKs, immutable trigger, forced RLS and private access verified (read-only).");
  console.log("Still required: restricted-role negative authorization, actual Class+Site operator/learner E2E, cross-workstream acceptance.");
} finally {
  await pool.end();
}
