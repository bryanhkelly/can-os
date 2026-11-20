#!/usr/bin/env node
/**
 * Read-only, fail-closed reconciliation inventory for remaining duplicate
 * table names in production main, including those already retired.
 * Never creates bridges, mutates records, or permits uncontrolled drops.
 *
 * CAN_MAIN_COLLISION_CHECK=1 DATABASE_URL=<Neon main> node \
 *   scripts/acceptance/check-main-event-enrollment-collisions.mjs
 */
import { neon } from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const collisions=[
  "audit_events","domain_events","enrollments",
  "graduation_decisions","qualification_definitions","transcript_issuances",
];
const expectedPublicAtAudit={
  audit_events:836,
  domain_events:268,
  enrollments:178,
  graduation_decisions:0,
  qualification_definitions:9,
  transcript_issuances:4,
};

async function run(){
  if(process.env.CAN_MAIN_COLLISION_CHECK!=="1"||!process.env.DATABASE_URL)
    throw new Error("Explicit opt-in and main DATABASE_URL are required");
  const sql=neon(process.env.DATABASE_URL);
  const [target]=await sql`
    SELECT current_setting('neon.project_id',true) project,
      current_setting('neon.branch_id',true) branch
  `;
  if(target?.project!==PROJECT||target?.branch!==MAIN)
    throw new Error("Refusing database outside CAN OS Neon main");

  const inventory=await sql`
    WITH names AS (SELECT unnest(${collisions}::text[]) AS name)
    SELECT names.name,
      old.oid::text legacy_oid, existing.oid::text public_oid,
      old.relrowsecurity AS legacy_rls,
      old.relforcerowsecurity AS legacy_force_rls,
      existing.relrowsecurity AS public_rls,
      existing.relforcerowsecurity AS public_force_rls,
      has_table_privilege('authenticated',existing.oid,'SELECT') AS public_authenticated_select,
      has_table_privilege('authenticated',existing.oid,'INSERT') AS public_authenticated_insert,
      has_table_privilege('authenticated',existing.oid,'UPDATE') AS public_authenticated_update,
      has_table_privilege('authenticated',existing.oid,'DELETE') AS public_authenticated_delete,
      (SELECT count(*)::int FROM pg_constraint fk
       WHERE fk.contype='f' AND fk.confrelid=old.oid) AS legacy_inbound_fks,
      (SELECT count(*)::int FROM pg_constraint fk
       WHERE fk.contype='f' AND fk.confrelid=existing.oid) AS public_inbound_fks,
      (SELECT count(*)::int FROM pg_proc p WHERE p.prosrc ILIKE '%'||names.name||'%')
        AS routine_text_mentions,
      (SELECT array_agg(a.attname ORDER BY a.attnum)
       FROM pg_attribute a WHERE a.attrelid=old.oid
         AND a.attnum>0 AND NOT a.attisdropped) AS legacy_columns,
      (SELECT array_agg(a.attname ORDER BY a.attnum)
       FROM pg_attribute a WHERE a.attrelid=existing.oid
         AND a.attnum>0 AND NOT a.attisdropped) AS public_columns
    FROM names
    LEFT JOIN pg_class old ON old.relname=names.name
      AND old.relnamespace=to_regnamespace('education_v30') AND old.relkind='r'
    LEFT JOIN pg_class existing ON existing.relname=names.name
      AND existing.relnamespace=to_regnamespace('public') AND existing.relkind='r'
    ORDER BY names.name
  `;

  // Only a fixed, audited list of relation names is permitted to become SQL
  // identifiers. Retired tables are absent, not silently interpreted as empty
  // when they still exist. This remains read-only on Neon main.
  const expected=new Set(collisions);
  if(inventory.length!==collisions.length||inventory.some(row=>!expected.has(row.name)))
    throw new Error("Collision inventory changed");
  const relationCount=async (schema,name)=>{
    if(!["public","education_v30"].includes(schema)||!expected.has(name))
      throw new Error("Unexpected relation requested for exact count");
    const [row]=await sql.query(
      'SELECT count(*)::int AS n FROM "'+schema+'"."'+name+'"'
    );
    return row.n;
  };
  const result=[];
  for(const row of inventory){
    if(!row.public_oid)throw new Error("Canonical public table missing: "+row.name);
    const legacyExists=row.legacy_oid!==null;
    const legacyRows=legacyExists?await relationCount("education_v30",row.name):0;
    const publicRows=await relationCount("public",row.name);
    result.push({
      table:row.name,legacy_oid:row.legacy_oid,public_oid:row.public_oid,
      status:legacyExists?"collision_unresolved":"legacy_relation_retired",
      legacy_rows:legacyRows,public_rows:publicRows,
      public_rows_at_prior_audit:expectedPublicAtAudit[row.name],
      public_rows_have_not_disappeared:publicRows>=expectedPublicAtAudit[row.name],
      legacy_inbound_fks:row.legacy_inbound_fks,
      public_inbound_fks:row.public_inbound_fks,
      legacy_rls:row.legacy_rls,public_rls:row.public_rls,
      public_authenticated_direct_access:{
        select:row.public_authenticated_select,
        insert:row.public_authenticated_insert,
        update:row.public_authenticated_update,
        delete:row.public_authenticated_delete,
      },
      routine_text_mentions:row.routine_text_mentions,
      columns_equal:legacyExists
        ?JSON.stringify(row.legacy_columns)===JSON.stringify(row.public_columns)
        :null,
    });
  }

  const blockers=[];
  for(const row of result){
    if(!row.public_rows_have_not_disappeared)
      blockers.push("Public historical count regressed: "+row.table);
    if(row.legacy_oid){
      blockers.push("Legacy table still exists: "+row.table);
      if(row.legacy_rows!==0)
        blockers.push("Legacy table contains records: "+row.table);
      if(row.legacy_inbound_fks>0)
        blockers.push("Legacy table has inbound FKs: "+row.table);
    }
    if(!row.public_rls&&Object.values(row.public_authenticated_direct_access).some(Boolean))
      blockers.push("Unrestricted authenticated public access: "+row.table);
  }
  console.log(JSON.stringify({
    project:target.project,branch:target.branch,read_only:true,
    collisions:result,blockers,retirementReady:blockers.length===0,
    drop_allowed:false,
  },null,2));
  if(blockers.length)process.exitCode=2;
}
run().catch(error=>{
 console.error(error instanceof Error?error.message:String(error));
 process.exitCode=1;
});
