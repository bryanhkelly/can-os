#!/usr/bin/env node
/**
 * Final education_v30 retirement gate for CAN OS main.
 * Read-only. No changes to identity, enrollment, evidence, or approval records.
 *
 * CAN_LEGACY_FINAL7_CHECK=1 DATABASE_URL=... node scripts/acceptance/check-main-final-seven-retirement.mjs
 *
 * Exit 0: retired, no legacy schema relations or native runtime writers.
 * Exit 2: blocked by remaining schema/data/runtime dependencies.
 * Exit 1: incorrect environment or unexpected inspection failure.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const MAIN_PROJECT = "sweet-hall-62441909";
const MAIN_BRANCH = "br-restless-sea-ar9ooo55";
const LEGACY = [
  "canonical_account_grants", "canonical_accounts", "canonical_sessions",
  "enrollments", "graduation_decisions", "persons",
  "qualification_definitions",
];
// Presence of native writers is release-blocking even if the table is empty.
const WRITERS = [
  ["src/modules/enrollment/noncredit-self-enrollment-identity.server.ts", "tx.insert(canonicalSessions)"],
  ["src/modules/enrollment/noncredit-self-enrollment.functions.ts", "tx.insert(canonicalAccounts)"],
  ["src/db/canonical-v301/auth.ts", 'educationV30.table("canonical_sessions"'],
  ["src/db/canonical-v301/self-enrollment.ts", 'educationV30.table("persons"'],
];
// These two names already exist in public with different column semantics.
// An FK rebind to a same-named destination is not evidence of compatibility.
const SEMANTIC_COLLISIONS = ["enrollments", "graduation_decisions", "qualification_definitions"];

async function main() {
  if (process.env.CAN_LEGACY_FINAL7_CHECK !== "1" || !process.env.DATABASE_URL) {
    throw Error("Explicit CAN_LEGACY_FINAL7_CHECK=1 and DATABASE_URL required");
  }
  const sql = neon(process.env.DATABASE_URL);
  const [target] = await sql`
    SELECT current_setting('neon.project_id',true) AS project,
           current_setting('neon.branch_id',true) AS branch,
           current_database() AS database
  `;
  if (target?.project !== MAIN_PROJECT || target.branch !== MAIN_BRANCH ||
      target.database !== "neondb") throw Error("Only reviewed CAN OS Neon main is supported");

  const rows = await sql`
    SELECT c.relname AS table_name,
           (xpath('/row/n/text()',query_to_xml(
             format('SELECT count(*) AS n FROM education_v30.%I',c.relname),
             false,true,'')))[1]::text::bigint AS row_count,
           (SELECT count(*)::int FROM pg_constraint k
              WHERE k.contype='f' AND k.confrelid=c.oid) AS inbound_fks,
           (SELECT count(*)::int FROM pg_constraint k
              JOIN pg_class child ON child.oid=k.conrelid
              JOIN pg_namespace ns ON ns.oid=child.relnamespace
              WHERE k.contype='f' AND k.confrelid=c.oid AND ns.nspname='public')
              AS public_inbound_fks,
           to_regclass('public.'||quote_ident(c.relname))::text AS public_collision
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='education_v30' AND c.relkind IN ('r','p')
    ORDER BY c.relname
  `;
  const functionConsumers = await sql`
    SELECT p.oid::regprocedure::text AS routine
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname IN ('public','education_v30','education_v30_secure')
      AND p.prokind IN ('f','p')
      AND (p.prosrc ILIKE '%canonical_sessions%'
        OR p.prosrc ILIKE '%canonical_accounts%'
        OR p.prosrc ILIKE '%canonical_account_grants%'
        OR p.prosrc ILIKE '%qualification_definitions%'
        OR p.prosrc ILIKE '%graduation_decisions%'
        OR p.prosrc ILIKE '%enrollments%')
    ORDER BY 1
  `;
  const writers = WRITERS.flatMap(([file, marker]) => {
    let source;
    try { source = readFileSync(new URL("../../" + file, import.meta.url), "utf8"); }
    catch (error) { throw Error("Cannot inspect mandatory runtime file " + file, {cause:error}); }
    return source.includes(marker) ? [{file, marker}] : [];
  });
  const unexpectedLegacyTables = rows.filter(r => !LEGACY.includes(r.table_name)).map(r=>r.table_name);
  const blocks = [];
  if (rows.length) blocks.push("education_v30_base_tables_still_exist");
  if (rows.some(r => Number(r.row_count) !== 0)) blocks.push("legacy_source_data_requires_migration");
  if (rows.some(r => Number(r.inbound_fks) !== 0)) blocks.push("legacy_foreign_keys_remain");
  if (functionConsumers.length) blocks.push("legacy_database_routines_remain");
  if (writers.length) blocks.push("native_identity_creation_paths_remain");
  if (unexpectedLegacyTables.length) blocks.push("unreviewed_legacy_tables");
  const semanticCollisions = rows.filter(r=>SEMANTIC_COLLISIONS.includes(r.table_name) && r.public_collision)
    .map(r=>r.table_name);
  if (semanticCollisions.length) blocks.push("same_name_tables_are_not_semantically_interchangeable");
  const result = {
    target:"CAN OS Neon main", readOnly:true, legacyTables:rows,
    foreignKeysRemaining:rows.reduce((n,r)=>n+Number(r.inbound_fks),0),
    publicForeignKeysRemaining:rows.reduce((n,r)=>n+Number(r.public_inbound_fks),0),
    functionConsumers:functionConsumers.map(r=>r.routine),
    runtimeNativeWriters:writers, semanticCollisions, unexpectedLegacyTables,
    blocks, retirementReady:blocks.length===0
  };
  console.log(JSON.stringify(result,null,2));
  if (blocks.length) process.exitCode=2;
}
main().catch(error=>{
  console.error("Final-seven retirement gate:",error instanceof Error ? error.message : "unexpected error");
  process.exitCode=1;
});
