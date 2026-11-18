#!/usr/bin/env node
/** Read-only, exact-Neon-main verification of Classroom Connect and network grant cutovers. */
import {neon} from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const expected={
  facilitated_rehearsal_events:{oid:"483539",fks:5,indexes:3},
  facilitated_room_assisted_activity_evidence:{oid:"516166",fks:5,indexes:4},
  network_reporting_grants:{oid:"542349",fks:4,indexes:2},
};
async function main(){
  if(process.env.CAN_MAIN_CLASSROOM_NETWORK_CHECK!=="1")
    throw Error("Set CAN_MAIN_CLASSROOM_NETWORK_CHECK=1 to run read-only main verification");
  if(!process.env.DATABASE_URL)throw Error("DATABASE_URL is required");
  const sql=neon(process.env.DATABASE_URL);
  const [context]=await sql`
    SELECT current_setting('neon.project_id',true) project_id,
      current_setting('neon.branch_id',true) branch_id,current_database() db
  `;
  if(context?.project_id!==PROJECT||context?.branch_id!==MAIN||context?.db!=="neondb")
    throw Error("Refusing database other than CAN OS production main");
  const rows=await sql`
    SELECT c.relname AS name,n.nspname AS schema_name,c.oid::text oid,
      c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
      has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select,
      has_table_privilege('anonymous',c.oid,'SELECT') AS anonymous_select,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid
        AND p.polroles=ARRAY['neondb_owner'::regrole]::oid[]) AS owner_policies,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
      (SELECT count(*)::int FROM pg_constraint f WHERE f.conrelid=c.oid AND f.contype='f'
        AND f.convalidated) AS fk_count,
      (SELECT count(*)::int FROM pg_constraint f WHERE f.conrelid=c.oid AND f.contype='f'
        AND NOT f.convalidated) AS invalid_fk_count,
      (SELECT count(*)::int FROM pg_index i WHERE i.indrelid=c.oid) AS index_count
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','education_v30') AND c.relkind='r'
      AND c.relname IN ('facilitated_rehearsal_events',
        'facilitated_room_assisted_activity_evidence','network_reporting_grants')
  `;
  if(rows.length!==3)throw Error("Missing or duplicate source tables");
  for(const row of rows){
    const spec=expected[row.name];
    if(!spec||row.schema_name!=="public"||row.oid!==spec.oid||
       !row.rls||!row.forced||row.auth_select||row.anonymous_select||
       row.policies!==1||row.owner_policies!==1||row.fk_count!==spec.fks||
       row.invalid_fk_count!==0||row.index_count!==spec.indexes)
      throw Error("Location, RLS, grants, OID, index, or FK mismatch: "+row.name);
  }
  console.log(JSON.stringify({verified:true,branch:MAIN,readOnly:true,
    originalTablesPreserved:rows.length,
    validatedForeignKeys:rows.reduce((s,r)=>s+r.fk_count,0),
    forcedRls:true,directClientTableReadDenied:true},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
