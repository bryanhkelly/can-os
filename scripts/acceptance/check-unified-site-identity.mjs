#!/usr/bin/env node
/**
 * READ-ONLY canonical-to-public consolidation preflight for the real Neon MAIN.
 * One schema, one Site identity, no translation table or guessed mapping.
 *
 * Requires: CAN_SITE_IDENTITY_PREFLIGHT=1 DATABASE_URL=<main postgres URL>
 * Refuses any database other than the project's exact current main branch.
 * Never inserts, updates, deletes, creates, moves, or grants anything.
 */
import { neon } from "@neondatabase/serverless";
const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";

async function main(){
  const env=process.env;
  if(env.CAN_SITE_IDENTITY_PREFLIGHT!=="1")throw new Error("Explicit CAN_SITE_IDENTITY_PREFLIGHT=1 is required");
  if(!env.DATABASE_URL)throw new Error("DATABASE_URL for the actual main database is required");
  if(!["postgres:","postgresql:"].includes(new URL(env.DATABASE_URL).protocol))
    throw new Error("PostgreSQL connection is required");
  const sql=neon(env.DATABASE_URL);
  const [branch]=await sql`
    SELECT current_setting('neon.project_id',true) AS project_id,
           current_setting('neon.branch_id',true) AS branch_id,
           current_database() AS database_name
  `;
  if(branch?.project_id!==PROJECT||branch?.branch_id!==MAIN)
    throw new Error("Refusing non-main Neon branch or unexpected project");

  const [summary]=await sql`
    SELECT
      (SELECT count(*)::int FROM public.sites) AS platform_sites,
      (SELECT count(*)::int FROM education_v30.sites) AS duplicate_canonical_sites,
      (SELECT count(*)::int FROM public.organizations) AS platform_organizations,
      (SELECT count(*)::int FROM education_v30.organizations) AS duplicate_canonical_organizations,
      to_regclass('public.site_canonical_identity_links') IS NULL AS site_identity_bridge_retired,
      (SELECT count(*)::int FROM education_v30.classes) AS native_classes,
      (SELECT count(*)::int FROM education_v30.class_sessions) AS native_sessions
  `;
  const namespaces=await sql`
    SELECT t.table_schema,count(*) FILTER (WHERE t.table_type='BASE TABLE')::int AS tables,
      count(*) FILTER (WHERE t.table_type='VIEW')::int AS views
    FROM information_schema.tables t
    WHERE t.table_schema IN ('public','education_v30','education_v30_secure')
    GROUP BY t.table_schema ORDER BY t.table_schema
  `;
  const conflicts=await sql`
    SELECT a.table_name FROM information_schema.tables a
      JOIN information_schema.tables b ON b.table_name=a.table_name
    WHERE a.table_schema='public' AND b.table_schema='education_v30'
    ORDER BY a.table_name
  `;
  const inbound=await sql`
    SELECT src_ns.nspname||'.'||src.relname AS from_table,c.conname,
      dst_ns.nspname||'.'||dst.relname AS to_table,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
      JOIN pg_class src ON src.oid=c.conrelid
      JOIN pg_namespace src_ns ON src_ns.oid=src.relnamespace
      JOIN pg_class dst ON dst.oid=c.confrelid
      JOIN pg_namespace dst_ns ON dst_ns.oid=dst.relnamespace
    WHERE c.contype='f'
      AND c.confrelid IN ('public.sites'::regclass,'education_v30.sites'::regclass,
        'public.organizations'::regclass,'education_v30.organizations'::regclass)
    ORDER BY from_table,c.conname
  `;
  const [rls]=await sql`
    SELECT
      (SELECT relforcerowsecurity FROM pg_class WHERE oid='education_v30.sites'::regclass) AS canonical_site_rls_forced,
      (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.sites'::regclass) AS public_site_rls_forced
  `;
  const [routineSummary]=await sql`
    SELECT count(*)::int AS canonical_routines FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='education_v30'
  `;
  const report={
    readOnly:true,project:PROJECT,branch:MAIN,decision:"NOT_READY",
    target:"one public application schema, with one public.sites and one public.organizations identity",
    summary,namespaces,collisions:conflicts.map(row=>row.table_name),
    duplicateIdentityInboundForeignKeys:inbound,
    security:rls,canonicalRoutines:routineSummary?.canonical_routines,
    outstanding:[
      "Review collision semantics, remaining production data and all SQL function/trigger dependencies",
      "Migrate table structures, indexes, relationships, and RLS without a dual-identity crosswalk",
      "Migrate canonical service and Drizzle SQL references in a coordinated application release",
      "Retire the empty duplicate canonical identity tables and unused bridge only after consumers are removed",
      "Run production rollback and authenticated access acceptance before claiming completion",
    ],
  };
  console.log(JSON.stringify(report,null,2));
  process.exitCode=2;
}
main().catch(error=>{
  console.error("Single-schema main preflight refused:",error instanceof Error?error.message:"unknown error");
  process.exitCode=1;
});
