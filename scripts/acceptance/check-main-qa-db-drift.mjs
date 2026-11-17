#!/usr/bin/env node
/**
 * CAN OS main/test01 read-only database drift audit.
 * Never edits a database, never stamps the migration ledger, never synchronizes
 * privileges. SQL metadata is fetched in READ ONLY transactions.
 *
 * CAN_DB_DRIFT_AUDIT=1 DATABASE_URL=... TEST_DATABASE_URL=... \
 * node scripts/acceptance/check-main-qa-db-drift.mjs
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

const MAIN_BRANCH="br-restless-sea-ar9ooo55";
const QA_BRANCH="br-bitter-feather-ar0u63x7";
if(process.env.CAN_DB_DRIFT_AUDIT!=="1" ||
   !process.env.DATABASE_URL || !process.env.TEST_DATABASE_URL ||
   process.env.DATABASE_URL===process.env.TEST_DATABASE_URL)
  throw new Error("Specify CAN_DB_DRIFT_AUDIT=1 and distinct main/test01 database URLs");

const queries={
  columns:`
    SELECT n.nspname||'.'||c.relname AS relation,a.attname AS name,
      format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull AS required,
      pg_get_expr(def.adbin,def.adrelid) AS default_expression
    FROM pg_attribute a
    JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef def ON def.adrelid=a.attrelid AND def.adnum=a.attnum
    WHERE n.nspname IN ('public','education_v30')
      AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY relation,name
  `,
  relations:`
    SELECT n.nspname||'.'||c.relname AS name,c.relkind AS kind,
      c.relrowsecurity AS rls,c.relforcerowsecurity AS forced_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','education_v30')
      AND c.relkind IN ('r','p','v','m')
    ORDER BY name
  `,
  indexes:`
    SELECT n.nspname||'.'||t.relname AS relation,
      pg_get_indexdef(i.oid) AS definition
    FROM pg_class i JOIN pg_index ix ON ix.indexrelid=i.oid
    JOIN pg_class t ON t.oid=ix.indrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname IN ('public','education_v30')
    ORDER BY relation,i.relname
  `,
  triggers:`
    SELECT n.nspname||'.'||c.relname||'.'||t.tgname AS name,
      t.tgenabled AS enabled,pg_get_triggerdef(t.oid,true) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','education_v30') AND NOT t.tgisinternal
    ORDER BY name
  `,
  policies:`
    SELECT schemaname||'.'||tablename||'.'||policyname AS name,
      cmd,permissive,roles::text AS roles,qual,with_check
    FROM pg_policies WHERE schemaname IN ('public','education_v30')
    ORDER BY name
  `,
  constraints:`
    SELECT n.nspname||'.'||c.relname AS relation,
      con.contype AS type,pg_get_constraintdef(con.oid,true) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','education_v30')
      AND con.contype IN ('c','f','u','p','x')
    ORDER BY relation,type,definition
  `,
  migrations:`
    SELECT hash,created_at::text AS applied_time FROM drizzle.__drizzle_migrations
    ORDER BY created_at,id
  `,
};

const indexIdentity=(row)=>row.relation+"|"+
  row.definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON /,"CREATE $1INDEX ON ")
    .replace(/\s+/g," ");
const columnIdentity=row=>row.relation+"."+row.name;
const constraintIdentity=row=>row.relation+"|"+row.type+"|"+row.definition;
const triggerIdentity=row=>row.name+"|"+row.enabled+"|"+row.definition;
const policyIdentity=row=>row.name+"|"+JSON.stringify([
  row.cmd,row.permissive,row.roles,row.qual,row.with_check,
]);
const keys={
  columns:columnIdentity,relations:r=>r.name,
  indexes:indexIdentity,triggers:triggerIdentity,
  policies:policyIdentity,constraints:constraintIdentity,
  migrations:r=>r.applied_time+"|"+r.hash,
};
const differences=(left,right,key)=>{
  const a=new Map(left.map(v=>[key(v),v]));
  const b=new Map(right.map(v=>[key(v),v]));
  return {
    onlyMain:left.filter(v=>!b.has(key(v))),
    onlyQa:right.filter(v=>!a.has(key(v))),
  };
};

async function inspect(url,branch){
  const pool=new Pool({connectionString:url,max:1});
  const client=await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const {rows:[identity]}=await client.query(
      "SELECT current_setting('neon.branch_id',true) AS branch");
    assert.equal(identity?.branch,branch,
      "Refusing database drift audit on an unexpected Neon branch");
    const data={};
    for(const [name,sql] of Object.entries(queries)){
      const {rows}=await client.query(sql);
      data[name]=rows;
    }
    await client.query("ROLLBACK");
    return data;
  } catch(error){
    await client.query("ROLLBACK").catch(()=>{});
    throw error;
  } finally{
    client.release();
    await pool.end();
  }
}

try {
  const main=await inspect(process.env.DATABASE_URL,MAIN_BRANCH);
  const qa=await inspect(process.env.TEST_DATABASE_URL,QA_BRANCH);
  const report={};
  for(const name of Object.keys(queries)){
    report[name]={
      mainCount:main[name].length,qaCount:qa[name].length,
      ...differences(main[name],qa[name],keys[name]),
    };
  }
  const mainColumns=new Map(main.columns.map(v=>[columnIdentity(v),v]));
  const qaColumns=new Map(qa.columns.map(v=>[columnIdentity(v),v]));
  const incompatibleColumns=main.columns.filter(v=>{
    const other=qaColumns.get(columnIdentity(v));
    return other && (v.data_type!==other.data_type ||
      v.required!==other.required ||
      v.default_expression!==other.default_expression);
  }).map(v=>({name:columnIdentity(v),
    main:v,qa:qaColumns.get(columnIdentity(v))}));
  const incompatibleRelations=main.relations.filter(v=>{
    const other=qa.relations.find(x=>x.name===v.name);
    return other && (v.kind!==other.kind);
  });
  const importantTriggers=[
    "education_v30.configuration_reviews.blueprint_configuration_review_append_only",
  ];
  for(const name of importantTriggers){
    assert(main.triggers.some(t=>t.name===name&&t.enabled==="O"),
      "Missing active immutable review guard on main");
    assert(qa.triggers.some(t=>t.name===name&&t.enabled==="O"),
      "Missing active immutable review guard on test01");
  }
  console.log(JSON.stringify({
    branches:{main:MAIN_BRANCH,qa:QA_BRANCH},
    counts:Object.fromEntries(Object.entries(report).map(([name,v])=>
      [name,{main:v.mainCount,qa:v.qaCount,
        onlyMain:v.onlyMain.length,onlyQa:v.onlyQa.length}])),
    columnConflicts:incompatibleColumns,
    relationTypeConflicts:incompatibleRelations,
    // Full policy, constraint, and historic hash diffs are surfaced for
    // review, not applied. Generated index names are normalized.
    policyDifferences:{
      onlyMain:report.policies.onlyMain.map(x=>x.name),
      onlyQa:report.policies.onlyQa.map(x=>x.name),
    },
    constraintDifferences:{
      onlyMain:report.constraints.onlyMain,
      onlyQa:report.constraints.onlyQa,
    },
  },null,2));
  if(report.relations.onlyQa.length||report.relations.onlyMain.length||
     report.columns.onlyQa.length||report.columns.onlyMain.length||
     incompatibleColumns.length||incompatibleRelations.length||
     report.indexes.onlyQa.length||report.indexes.onlyMain.length||
     report.triggers.onlyQa.length||report.triggers.onlyMain.length){
    throw new Error("Structural database drift remains");
  }
  console.log("CAN OS structural parity PASSED; policy/constraint/ledger exceptions require explicit review.");
} catch(error){
  console.error("CAN OS database drift audit FAILED:",
    error instanceof Error?error.message:"unknown");
  process.exitCode=1;
}
