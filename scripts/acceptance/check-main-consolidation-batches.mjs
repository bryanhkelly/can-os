#!/usr/bin/env node
/**
 * Read-only reconciliation for nine applied main batches (8 + 46 + 51 + 22 + 8 + 12 + 38 + 9 + 10).
 * Does not run a migration or modify a database.
 *
 * CAN_MAIN_CONSOLIDATION_CHECK=1 DATABASE_URL=<main Neon URL> \
 * node scripts/acceptance/check-main-consolidation-batches.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const project="sweet-hall-62441909";
const branch="br-restless-sea-ar9ooo55";
const sources=[
  ["applied-eight","database/production/2026-11-18-consolidate-eight-unmapped-tables.sql",8,7],
  ["applied-forty-six","database/production/2026-11-18-consolidate-46-function-backed-empty-tables.sql",46,9],
  ["applied-fifty-one","database/production/2026-11-18-consolidate-51-remaining-unmapped-empty-tables.sql",51,9],
  ["applied-twenty-two","database/production/2026-11-19-consolidate-22-empty-foundation-funding-qualification-tables.sql",22,"json"],
  ["applied-eight-assessments","database/production/2026-11-19-consolidate-eight-assessment-grading-tables.sql",8,"json"],
  ["applied-twelve-blueprints","database/production/2026-11-19-consolidate-12-blueprint-tables.sql",12,"json"],
  ["applied-thirty-eight","database/production/2026-11-19-consolidate-38-assessment-survey-qualification-completion-tables.sql",38,"json"],
  ["applied-nine-instructional","database/production/2026-11-19-consolidate-nine-instructional-track-tables.sql",9,"json"],
  ["applied-ten-content","database/production/2026-11-19-consolidate-10-content-professional-tables.sql",10,"json"],
];
if(process.env.CAN_MAIN_CONSOLIDATION_CHECK!=="1" || !process.env.DATABASE_URL)
  throw new Error("Explicit read-only opt-in and production DATABASE_URL required");

function parseBatch([label,file,expected,arity]){
  const source=readFileSync(file,"utf8");
  if(arity==="json"){
    const match=source.match(/snapshot\s+jsonb\s*:=\s*'([^']+)'::jsonb/);
    if(!match)throw new Error("Expected a pinned JSON snapshot in "+file);
    const records=JSON.parse(match[1]).map(x=>({
      name:x.name,oid:x.oid,rls:x.rls,force:x.force_rls??x.forced,policies:x.pol,
      triggers:x.trg,outf:x.out_fks??x.outf,inf:x.in_fks??x.inf,indexes:x.indexes??x.idx,
    }));
    if(records.length!==expected||new Set(records.map(x=>x.name)).size!==expected)
      throw new Error("Pinned JSON migration inventory mismatch in "+file);
    return {label,file,records,state:"applied"};
  }
  const tuple=new RegExp(
    "\\('([a-z_]+)'\\s*,\\s*(\\d+)\\s*,\\s*(true|false)\\s*,"+
    (arity===9?"\\s*(true|false)\\s*,":"")+
    "\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)"+
    (arity===9?",\\s*(\\d+)":"")+"\\s*\\)","g");
  const catalog=new Map();
  for(const m of source.matchAll(tuple)){
    const record=arity===9?
      {name:m[1],oid:Number(m[2]),rls:m[3]==="true",force:m[4]==="true",
       policies:Number(m[5]),triggers:Number(m[6]),outf:Number(m[7]),inf:Number(m[8]),indexes:Number(m[9])}:
      {name:m[1],oid:Number(m[2]),rls:m[3]==="true",force:m[3]==="true",
       policies:Number(m[4]),triggers:Number(m[5]),inf:Number(m[6]),outf:Number(m[7])};
    const earlier=catalog.get(record.name);
    if(earlier && JSON.stringify(earlier)!==JSON.stringify(record))
      throw new Error("Inconsistent snapshot for "+record.name+" in "+file);
    catalog.set(record.name,record);
  }
  if(catalog.size!==expected)throw new Error("Migration inventory mismatch: "+label+
    " expected "+expected+", parsed "+catalog.size);
  return {label,file,records:[...catalog.values()],state:"applied"};
}

async function main(){
  const batches=sources.map(parseBatch);
  const all=batches.flatMap(b=>b.records.map(r=>({...r,batch:b.label,state:b.state})));
  if(new Set(all.map(r=>r.name)).size!==all.length)
    throw new Error("The migration batches contain duplicate table names");
  const sql=neon(process.env.DATABASE_URL);
  const [identity]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
           current_setting('neon.branch_id',true) AS branch,
           current_database() AS database
  `;
  if(identity?.project!==project||identity?.branch!==branch||identity?.database!=="neondb")
    throw new Error("Refusing verification outside CAN OS Neon main");

  const names=all.map(r=>r.name);
  const objects=await sql`
    SELECT c.relname AS name,n.nspname AS schema,c.oid::int AS oid,
      c.relrowsecurity AS rls,c.relforcerowsecurity AS force,
      (SELECT count(*)::int FROM pg_policy WHERE polrelid=c.oid) AS policies,
      (SELECT count(*)::int FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) AS triggers,
      (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='f') AS outf,
      (SELECT count(*)::int FROM pg_constraint k WHERE k.confrelid=c.oid AND k.contype='f') AS inf,
      (SELECT count(*)::int FROM pg_index WHERE indrelid=c.oid) AS indexes,
      c.relacl IS NULL AS no_custom_acl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','education_v30') AND c.relkind IN ('r','p')
      AND c.relname=ANY(${names}::text[])
  `;
  const byKey=new Map(objects.map(o=>[o.schema+"."+o.name,o]));
  const discrepancies=[];
  for(const item of all){
    const target=item.state==="applied"?"public":"education_v30";
    const other=target==="public"?"education_v30":"public";
    const row=byKey.get(target+"."+item.name);
    if(!row || byKey.has(other+"."+item.name)){
      discrepancies.push({name:item.name,batch:item.batch,error:"Expected unique table in "+target});
      continue;
    }
    for(const field of ["oid","rls","force","policies","triggers","outf","inf"]){
      if(item[field]!==row[field])
        discrepancies.push({name:item.name,batch:item.batch,field,expected:item[field],actual:row[field]});
    }
    if(item.indexes!==undefined && item.indexes!==row.indexes)
      discrepancies.push({name:item.name,batch:item.batch,field:"indexes",
        expected:item.indexes,actual:row.indexes});
    if(!row.no_custom_acl)
      discrepancies.push({name:item.name,batch:item.batch,error:"Unexpected table ACL"});
  }

  // Live rows may be written to public after cutover; do not incorrectly
  // require these migrated tables to remain empty forever.
  const relationCounts=await sql`
    SELECT n.nspname AS schema, count(*) FILTER(WHERE c.relkind IN ('r','p'))::int AS tables
    FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid
    WHERE n.nspname IN ('public','education_v30','education_v30_secure')
    GROUP BY n.nspname ORDER BY n.nspname
  `;
  const crossings=await sql`
    SELECT count(*)::int AS foreign_keys
    FROM pg_constraint con
    JOIN pg_class source ON source.oid=con.conrelid
    JOIN pg_namespace source_ns ON source_ns.oid=source.relnamespace
    JOIN pg_class target ON target.oid=con.confrelid
    JOIN pg_namespace target_ns ON target_ns.oid=target.relnamespace
    WHERE con.contype='f'
      AND source_ns.nspname='public'
      AND target_ns.nspname IN ('education_v30','education_v30_secure')
  `;
  const report={readOnly:true,project,branch,
    batches:batches.map(b=>({name:b.label,state:b.state,expectedTables:b.records.length})),
    verifiedAppliedTables:all.length,liveSchemaTables:relationCounts,
    remainingPublicToLegacyForeignKeys:crossings[0]?.foreign_keys??null,discrepancies};
  console.log(JSON.stringify(report,null,2));
  if(discrepancies.length||all.length!==204)process.exitCode=2;
}

main().catch(e=>{console.error("CAN OS consolidation reconciliation FAILED:",e.message);process.exitCode=1;});
