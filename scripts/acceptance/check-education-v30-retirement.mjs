#!/usr/bin/env node
/**
 * Read-only production retirement gate for the legacy canonical schemas.
 * Usage: CAN_EDUCATION_RETIREMENT_CHECK=1 DATABASE_URL=<actual Neon main>
 *        node scripts/acceptance/check-education-v30-retirement.mjs
 * This is deliberately failing until the full application cutover is complete.
 * Reports exact row counts for every remaining education_v30 table; it never
 * drops, changes or copies data and does not read secure-schema table records.
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  if(process.env.CAN_EDUCATION_RETIREMENT_CHECK!=="1"||!process.env.DATABASE_URL)
    throw new Error("Explicit opt-in and DATABASE_URL required");
  const sql=neon(process.env.DATABASE_URL);
  const [target]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
           current_setting('neon.branch_id',true) AS branch,
           current_database() AS database, current_user AS role
  `;
  if(target.project!=="sweet-hall-62441909"||
     target.branch!=="br-restless-sea-ar9ooo55"||
     target.database!=="neondb"||target.role!=="neondb_owner")
    throw new Error("Production Neon main and its owner role are required for exact row counts");
  const [inventory]=await sql`
    SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='education_v30' AND c.relkind IN ('r','p')) AS native_tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='education_v30_secure' AND c.relkind IN ('r','p')) AS secure_tables,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname IN ('education_v30','education_v30_secure')) AS old_relations,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname IN ('education_v30','education_v30_secure')) AS old_routines,
      (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
       WHERE n.nspname IN ('education_v30','education_v30_secure')) AS old_types,
      (SELECT count(*)::int FROM pg_constraint k
         JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_class target ON target.oid=k.confrelid
         JOIN pg_namespace tn ON tn.oid=target.relnamespace
       WHERE k.contype='f'
         AND ((n.nspname='public' AND tn.nspname IN ('education_v30','education_v30_secure'))
           OR (tn.nspname='public' AND n.nspname IN ('education_v30','education_v30_secure')))) AS crossing_fks,
      (SELECT count(*)::int FROM pg_namespace n
       WHERE n.nspname IN ('education_v30','education_v30_secure')) AS old_schemas,
      (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c
       WHERE c.oid='public.sites'::regclass) AS public_site_rls_enforced,
      (to_regclass('education_v30.assurance_case_outcomes') IS NULL
        AND to_regprocedure('education_v30.v27_validate_case_outcome()') IS NULL)
        AS retired_unused_assurance_leaf_absent,
      (to_regclass('education_v30.assurance_cases') IS NOT NULL
        AND to_regclass('public.assurance_case_findings') IS NOT NULL)
        AS retained_assurance_relations_present
  `;
  const [collision]=await sql`
    SELECT count(*)::int AS count FROM pg_class a
    JOIN pg_namespace an ON an.oid=a.relnamespace
    JOIN pg_class b ON a.relname=b.relname
    JOIN pg_namespace bn ON bn.oid=b.relnamespace
    WHERE an.nspname='education_v30' AND bn.nspname='public'
      AND a.relkind IN ('r','p') AND b.relkind IN ('r','p')
  `;
  // Exact row counts, not pg_class.reltuples estimates. Read-only: even an
  // empty legacy table can still carry an application/schema dependency.
  const legacyRelations=await sql`
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='education_v30' AND c.relkind IN ('r','p')
    ORDER BY c.relname
  `;
  const quoteIdentifier=value=>'"'+value.replaceAll('"','""')+'"';
  const counts=[];
  for(let start=0;start<legacyRelations.length;start+=50){
    const batch=legacyRelations.slice(start,start+50);
    const query=batch.map(({name})=>
      'SELECT '+"'"+name.replaceAll("'","''")+"'"+' AS name, count(*)::bigint AS record_count '+
      'FROM education_v30.'+quoteIdentifier(name)
    ).join(' UNION ALL ');
    counts.push(...await sql.query(query));
  }
  if(counts.length!==inventory.native_tables)
    throw new Error("Legacy inventory count changed during verification");
  const populated=counts
    .filter(row=>BigInt(row.record_count)>0n)
    .map(row=>({name:row.name,rows:String(row.record_count)}))
    .sort((a,b)=>Number(BigInt(b.rows)-BigInt(a.rows))||a.name.localeCompare(b.name));
  const result={
    project:target.project,branch:target.branch,readOnly:true,
    native_empty_tables:counts.length-populated.length,
    native_populated_tables:populated.length,
    populated_native_tables:populated,
    ...inventory,colliding_names:collision.count,
    old_schema_absent:inventory.old_schemas===0
  };
  console.log(JSON.stringify(result,null,2));
  const safe=inventory.old_relations===0&&inventory.old_routines===0&&
    inventory.old_types===0&&inventory.crossing_fks===0&&
    collision.count===0&&inventory.public_site_rls_enforced===true&&
    inventory.retired_unused_assurance_leaf_absent===true;
  if(!safe){
    console.error("NOT READY: preserve old schemas. Resolve all dependencies and validate live flows before guarded DROP SCHEMA RESTRICT.");
    process.exitCode=2;
  } else console.log("Structural retirement gate passed. Application and permission acceptance remain separately required.");
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
