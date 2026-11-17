#!/usr/bin/env node
/**
 * Read-only proof of CAN OS single-public-schema relocation on Neon MAIN.
 * Every claimed move is taken from the committed migration SQL, not an
 * independently maintained list of tables. No writes and no identity aliases.
 *
 * CAN_SCHEMA_CONSOLIDATION_CHECK=1 DATABASE_URL=<Neon main>
 *   node scripts/acceptance/check-public-schema-consolidation.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const repoFiles=[
  "database/production/2026-11-17-consolidate-feedback-categories.sql",
  "database/production/2026-11-17-consolidate-static-reference-tables.sql",
  "database/production/2026-11-17-consolidate-36-empty-legacy-tables.sql",
  "database/production/2026-11-17-consolidate-8-empty-operational-tables.sql",
];
const referenceRowCounts={
  feedback_categories:8,workforce_families:9,workforce_delivery_modes:5,
  vocabularies:12,vocabulary_terms:80,facility_capability_types:6,
  capability_delivery_modes:20,
};

function migratedTableNames(){
  const tables=[];
  for(const file of repoFiles){
    const text=readFileSync(file,"utf8");
    const matches=[...text.matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm)];
    if(!matches.length)throw new Error("No reviewed table moves in "+file);
    for(const [,name] of matches){
      if(tables.includes(name))throw new Error("Duplicate migration of "+name);
      tables.push(name);
    }
  }
  return tables;
}

async function run(){
  if(process.env.CAN_SCHEMA_CONSOLIDATION_CHECK!=="1"||!process.env.DATABASE_URL)
    throw new Error("Explicit main-only read-only verification and DATABASE_URL required");
  const url=new URL(process.env.DATABASE_URL);
  if(!["postgres:","postgresql:"].includes(url.protocol))
    throw new Error("Expected PostgreSQL DATABASE_URL");
  const sql=neon(process.env.DATABASE_URL);
  const [target]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
      current_setting('neon.branch_id',true) AS branch
  `;
  if(target?.project!=="sweet-hall-62441909"||
    target?.branch!=="br-restless-sea-ar9ooo55")
    throw new Error("Refusing anything other than actual Neon main");

  const names=migratedTableNames();
  const state=await sql`
    SELECT name,
      to_regclass('public.'||name) IS NOT NULL AS public_present,
      to_regclass('education_v30.'||name) IS NOT NULL AS canonical_present
    FROM unnest(${names}::text[]) AS name
    ORDER BY name
  `;
  const missing=state.filter(row=>!row.public_present||row.canonical_present);
  if(missing.length)
    throw new Error("Incomplete relocation: "+missing.map(row=>row.name).join(", "));

  const counts=await sql`
    SELECT c.relname AS name, count_table.n::bigint AS total_rows
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
    JOIN LATERAL (
      SELECT CASE WHEN c.relname='feedback_categories'
            THEN (SELECT count(*) FROM public.feedback_categories)
        WHEN c.relname='workforce_families'
            THEN (SELECT count(*) FROM public.workforce_families)
        WHEN c.relname='workforce_delivery_modes'
            THEN (SELECT count(*) FROM public.workforce_delivery_modes)
        WHEN c.relname='vocabularies'
            THEN (SELECT count(*) FROM public.vocabularies)
        WHEN c.relname='vocabulary_terms'
            THEN (SELECT count(*) FROM public.vocabulary_terms)
        WHEN c.relname='facility_capability_types'
            THEN (SELECT count(*) FROM public.facility_capability_types)
        WHEN c.relname='capability_delivery_modes'
            THEN (SELECT count(*) FROM public.capability_delivery_modes)
        END AS n
    ) count_table ON true
    WHERE ns.nspname='public' AND c.relname=ANY(${Object.keys(referenceRowCounts)}::text[])
  `;
  for(const row of counts){
    if(Number(row.total_rows)!==referenceRowCounts[row.name])
      throw new Error("Reference record count changed: "+row.name);
  }
  const fk=await sql`
    SELECT count(*)::int AS count
    FROM pg_constraint c
      JOIN pg_class dest ON dest.oid=c.confrelid
      JOIN pg_namespace n ON n.oid=dest.relnamespace
    WHERE c.contype='f'
      AND n.nspname='public'
      AND dest.relname=ANY(${names}::text[])
  `;
  const [overall]=await sql`
    SELECT
      (SELECT count(*)::int FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE') AS public_tables,
      (SELECT count(*)::int FROM information_schema.tables
       WHERE table_schema='education_v30' AND table_type='BASE TABLE') AS canonical_tables,
      to_regclass('public.site_canonical_identity_links') IS NULL AS site_identity_bridge_retired
  `;
  console.log(JSON.stringify({branch:target.branch,readOnly:true,verifiedMoves:names.length,
    referencesRetained:counts.reduce((n,row)=>n+Number(row.total_rows),0),
    fkReferencesToMovedTables:Number(fk[0]?.count??0),
    ...overall,fullyUnified:overall.canonical_tables===0},null,2));
  if(overall.canonical_tables!==0)process.exitCode=2;
}
run().catch(error=>{
  console.error("Single-schema reconciliation failed:",
    error instanceof Error?error.message:"unknown");
  process.exitCode=1;
});
