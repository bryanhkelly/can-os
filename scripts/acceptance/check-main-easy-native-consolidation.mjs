#!/usr/bin/env node
/** Read-only production main verification of safe native table relocations. */
import {neon} from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const expected={
  equipment_ownership_periods:3,
  evaluation_basis_invalidations:3,
  improvement_action_evidence:3,
  qualification_reassessment_requests:3,
  deployment_operating_contexts:2,
  funding_award_eligible_deployments:3,
  initiative_deployments:3,
};
const routines={
  v29_guard_subject:"public.equipment_ownership_periods",
  v30_evaluation_basis_is_current:"public.evaluation_basis_invalidations",
  v27_verify_improvement:"public.improvement_action_evidence",
  v29_queue_qualification_reassessment:"public.qualification_reassessment_requests",
  v28_require_youth_readiness:"public.deployment_operating_contexts",
  v292_program_activation_preflight:"public.deployment_operating_contexts",
  v28_enforce_funding_attribution:"public.funding_award_eligible_deployments",
  v28_validate_funded_deployment_scope:"public.funding_award_eligible_deployments",
  v28_register_noncredit:"public.initiative_deployments",
};
async function main(){
  if(process.env.CAN_MAIN_EASY_CONSOLIDATION_CHECK!=="1")
    throw new Error("Explicit CAN_MAIN_EASY_CONSOLIDATION_CHECK=1 required");
  if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
  const sql=neon(process.env.DATABASE_URL);
  const [identity]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
      current_setting('neon.branch_id',true) AS branch,
      current_database() AS database
  `;
  if(identity?.project!==PROJECT||identity?.branch!==MAIN||identity?.database!=="neondb")
    throw new Error("Refusing non-main project or database");
  const tables=await sql`
    SELECT c.relname AS name,n.nspname AS schema_name,c.relrowsecurity AS rls,
      c.relforcerowsecurity AS forced,
      has_table_privilege('authenticated',c.oid,'SELECT') AS client_read,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
      (SELECT count(*)::int FROM pg_constraint fk WHERE fk.conrelid=c.oid
        AND fk.contype='f' AND fk.convalidated) AS valid_fks,
      (SELECT count(*)::int FROM pg_constraint fk WHERE fk.conrelid=c.oid
        AND fk.contype='f' AND NOT fk.convalidated) AS invalid_fks
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN('public','education_v30') AND c.relkind IN('r','p')
      AND c.relname IN (
        'equipment_ownership_periods','evaluation_basis_invalidations',
        'improvement_action_evidence','qualification_reassessment_requests',
        'deployment_operating_contexts','funding_award_eligible_deployments',
        'initiative_deployments')
  `;
  if(tables.length!==Object.keys(expected).length)
    throw new Error("One or more expected tables is missing or duplicated");
  for(const table of tables){
    if(table.schema_name!=="public"||table.rls!==true||table.forced!==true||
      table.client_read!==false||table.policies!==1||table.invalid_fks!==0||
      table.valid_fks!==expected[table.name])
      throw new Error("Table location, ACL, RLS or FK mismatch: "+table.name);
  }
  const functions=await sql`
    SELECT p.proname AS name, pg_get_functiondef(p.oid) AS body
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30'
      AND p.proname IN (
        'v29_guard_subject','v30_evaluation_basis_is_current',
        'v27_verify_improvement','v29_queue_qualification_reassessment',
        'v28_require_youth_readiness','v292_program_activation_preflight',
        'v28_enforce_funding_attribution','v28_validate_funded_deployment_scope',
        'v28_register_noncredit')
  `;
  if(functions.length!==Object.keys(routines).length)
    throw new Error("Missing guarded native business routine");
  for(const func of functions){
    if(!func.body.includes(routines[func.name]))
      throw new Error("Routine still references retired physical location: "+func.name);
  }
  console.log(JSON.stringify({verified:true,readOnly:true,branch:MAIN,
    movedTables:tables.length,validatedForeignKeys:tables.reduce((a,b)=>a+b.valid_fks,0),
    checkedRoutines:functions.length,clientReadsDenied:true,forceRlsPreserved:true},null,2));
}
main().catch(err=>{
  console.error("Main native consolidation verification failed:",
    err instanceof Error?err.message:"unknown error");
  process.exitCode=1;
});
