#!/usr/bin/env node
/**
 * Read-only reconciliation for the two applied main batches (8 + 46) and
 * the pending 51-table batch. Does not run a migration or modify a database.
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
  ["staged-fifty-one","database/production/2026-11-18-consolidate-51-remaining-unmapped-empty-tables.sql",51,9],
];
if(process.env.CAN_MAIN_CONSOLIDATION_CHECK!=="1" || !process.env.DATABASE_URL)
  throw new Error("Explicit read-only opt-in and production DATABASE_URL required");

function parseBatch([label,file,expected,arity]){
  const source=readFileSync(file,"utf8");
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
  return {label,file,records:[...catalog.values()],state:label.startsWith("applied")?"applied":"staged"};
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

  // Metadata is checked separately from exact row counts; staged tables must
  // remain empty before applying the prepared, zero-row-only migration.
  const staged=batches.find(b=>b.state==="staged").records.map(r=>r.name);
  const quote=name=>'"'+name.replaceAll('"','""')+'"';
  const counts=[];
  for(let i=0;i<staged.length;i+=25){
    const part=staged.slice(i,i+25);
    const query=part.map(name=>"SELECT '"+name.replaceAll("'","''")+
      "' AS name, count(*)::bigint AS rows FROM education_v30."+quote(name)).join(" UNION ALL ");
    counts.push(...await sql.query(query));
  }
  const nonempty=counts.filter(x=>BigInt(x.rows)!==0n)
    .map(x=>({name:x.name,rows:String(x.rows)}));
  const report={readOnly:true,project,branch,batches:batches.map(b=>({
    name:b.label,state:b.state,expectedTables:b.records.length
  })),verifiedAppliedTables:54,stagedEmptyTables:counts.length-nonempty.length,
    nonemptyStagedTables:nonempty,discrepancies};
  console.log(JSON.stringify(report,null,2));
  if(discrepancies.length||nonempty.length||counts.length!==51)
    process.exitCode=2;
}

main().catch(e=>{console.error("CAN OS consolidation reconciliation FAILED:",e.message);process.exitCode=1;});
