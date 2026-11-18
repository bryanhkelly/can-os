#!/usr/bin/env node
/** Read-only Neon main validation of four live learning-table mappings. */
import {neon} from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909", MAIN="br-restless-sea-ar9ooo55";
const expected={guardian_authorities:2,enrollment_prospect_interests:4,
 learner_unit_progress:2,facilitated_pairing_rate_limits:0};
async function main(){
 if(process.env.CAN_LEARNING_TABLE_CUTOVER_CHECK!=="1")
   throw Error("Explicit CAN_LEARNING_TABLE_CUTOVER_CHECK=1 required");
 if(!process.env.DATABASE_URL)throw Error("DATABASE_URL required");
 const sql=neon(process.env.DATABASE_URL);
 const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,
  current_setting('neon.branch_id',true) AS branch,current_database() AS db`;
 if(identity?.project!==PROJECT||identity?.branch!==MAIN||identity?.db!=="neondb")
   throw Error("Refusing non-main database");
 const rows=await sql`SELECT c.relname AS name,n.nspname AS schema_name,
 c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
 has_table_privilege('authenticated',c.oid,'SELECT') AS client_read,
 has_table_privilege('anonymous',c.oid,'SELECT') AS anon_read,
 (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
 (SELECT count(*)::int FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=c.oid AND f.convalidated) AS fks,
 (SELECT count(*)::int FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=c.oid AND NOT f.convalidated) AS invalid_fks
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','education_v30') AND c.relkind IN ('r','p')
 AND c.relname IN ('guardian_authorities','enrollment_prospect_interests',
  'learner_unit_progress','facilitated_pairing_rate_limits')`;
 if(rows.length!==4)throw Error("Expected four unique relations");
 for(const r of rows){
   if(r.schema_name!=="public"||r.rls!==true||r.forced!==true||
      r.client_read!==false||r.anon_read!==false||
      r.policies!==1||r.fks!==expected[r.name]||r.invalid_fks!==0)
     throw Error("Unexpected location, security or FK status: "+r.name);
 }
 console.log(JSON.stringify({verified:true,readOnly:true,branch:MAIN,tables:rows.length,
  validatedForeignKeys:rows.reduce((sum,r)=>sum+r.fks,0),forcedRls:true},null,2));
}
main().catch(e=>{console.error("Learning table cutover failed:",e.message);process.exitCode=1});
