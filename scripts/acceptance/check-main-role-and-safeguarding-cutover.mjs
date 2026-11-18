#!/usr/bin/env node
/** Read-only Neon-main validation for role grants and safeguarding triage cutover. */
import {neon} from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const specs={
  database_role_organization_bindings:{oid:"416485",fks:1,indexes:2},
  safeguarding_triage_queue:{oid:"412764",fks:2,indexes:3},
};
const functions={
  v28_role_can_access_org:{oid:"416505",definer:true,triggerCount:0,ref:"public.database_role_organization_bindings"},
  v28_role_has_purpose:{oid:"416506",definer:true,triggerCount:0,ref:"public.database_role_organization_bindings"},
  v27_open_safeguarding_case_triage:{oid:"413547",definer:false,triggerCount:1,ref:"INSERT INTO public.safeguarding_triage_queue("},
  v27_open_safety_feedback_triage:{oid:"413545",definer:false,triggerCount:1,ref:"INSERT INTO public.safeguarding_triage_queue("},
  v28_triage_feedback_reclassified:{oid:"416145",definer:false,triggerCount:1,ref:"INSERT INTO public.safeguarding_triage_queue("},
};

async function main(){
  if(process.env.CAN_MAIN_AUTH_SAFETY_CHECK!=="1")
    throw Error("Set CAN_MAIN_AUTH_SAFETY_CHECK=1 before read-only production validation");
  if(!process.env.DATABASE_URL)throw Error("DATABASE_URL is required");
  const sql=neon(process.env.DATABASE_URL);
  const [target]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
      current_setting('neon.branch_id',true) AS branch,current_database() AS db
  `;
  if(target?.project!==PROJECT||target?.branch!==MAIN||target?.db!=="neondb")
    throw Error("Refusing Neon project/branch other than CAN OS production main");
  const tables=await sql`
    SELECT c.relname AS name,n.nspname AS schema_name,c.oid::text AS oid,
      c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
      has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select,
      has_table_privilege('anonymous',c.oid,'SELECT') AS anon_select,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid
        AND p.polroles=ARRAY['neondb_owner'::regrole]::oid[]) AS owner_only_policies,
      (SELECT count(*)::int FROM pg_constraint fk WHERE fk.conrelid=c.oid
        AND fk.contype='f' AND fk.convalidated) AS valid_fks,
      (SELECT count(*)::int FROM pg_constraint fk WHERE fk.conrelid=c.oid
        AND fk.contype='f' AND NOT fk.convalidated) AS invalid_fks,
      (SELECT count(*)::int FROM pg_index i WHERE i.indrelid=c.oid) AS indexes
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('education_v30','public') AND c.relkind='r'
      AND c.relname IN ('database_role_organization_bindings','safeguarding_triage_queue')
  `;
  if(tables.length!==2)throw Error("Missing or duplicated physical role/safety table");
  for(const t of tables){
    const expected=specs[t.name];
    if(!expected||t.schema_name!=="public"||t.oid!==expected.oid||
      t.rls!==true||t.force_rls!==true||t.auth_select!==false||
      t.anon_select!==false||t.policies!==1||t.owner_only_policies!==1||
      t.valid_fks!==expected.fks||t.invalid_fks!==0||t.indexes!==expected.indexes)
      throw Error("Unexpected table policy, FK or location: "+t.name);
  }
  const funcs=await sql`
    SELECT p.proname name,p.oid::text oid,p.prosecdef definer,
      pg_get_functiondef(p.oid) AS body,
      (SELECT count(*)::int FROM pg_depend d WHERE d.refobjid=p.oid
        AND d.classid='pg_trigger'::regclass AND d.deptype='n') AS triggers
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30' AND p.proname IN (
      'v28_role_can_access_org','v28_role_has_purpose',
      'v27_open_safeguarding_case_triage','v27_open_safety_feedback_triage',
      'v28_triage_feedback_reclassified')
  `;
  if(funcs.length!==5)throw Error("Missing or duplicate authorization/triage functions");
  for(const f of funcs){
    const expected=functions[f.name];
    if(!expected||f.oid!==expected.oid||f.definer!==expected.definer||
       f.triggers!==expected.triggerCount||!f.body.includes(expected.ref))
      throw Error("Security function drift: "+f.name);
  }
  const [denied]=await sql`
    SELECT education_v30.v28_role_has_purpose('__not_authorized__') AS role_denied,
      education_v30.v28_role_can_access_org(
        '00000000-0000-0000-0000-000000000000'::uuid,'__not_authorized__'
      ) AS org_denied
  `;
  if(denied?.role_denied!==false||denied?.org_denied!==false)
    throw Error("Unauthorized scope unexpectedly allowed");
  console.log(JSON.stringify({verified:true,readOnly:true,branch:MAIN,
    movedTables:tables.length,validatedForeignKeys:3,
    originalSecurityFunctions:funcs.length,
    ownerOnlyPolicies:2,unauthorizedAccessDenied:true},null,2));
}
main().catch(error=>{
  console.error("Main authorization/safeguarding verification failed:",
    error instanceof Error?error.message:"unknown error");
  process.exitCode=1;
});
