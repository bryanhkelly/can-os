#!/usr/bin/env node
/** Read-only Neon production main acceptance for protected learner/consent records. */
import {neon} from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const expected={
  instructional_learner_login_bindings:{oid:"418949",fks:1,indexes:1},
  qualification_person_consent_withdrawals:{oid:"416894",fks:3,indexes:3},
};
async function main(){
  if(process.env.CAN_MAIN_PROTECTED_IDENTITY_CHECK!=="1")
    throw Error("Set CAN_MAIN_PROTECTED_IDENTITY_CHECK=1 before read-only main validation");
  if(!process.env.DATABASE_URL)throw Error("DATABASE_URL is required");
  const sql=neon(process.env.DATABASE_URL);
  const [identity]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
      current_setting('neon.branch_id',true) AS branch,
      current_database() AS db
  `;
  if(identity?.project!==PROJECT||identity?.branch!==MAIN||identity?.db!=="neondb")
    throw Error("Refusing non-main database");
  const tables=await sql`
    SELECT c.relname name,n.nspname schema_name,c.oid::text oid,
      c.relrowsecurity rls,c.relforcerowsecurity forced,
      has_table_privilege('authenticated',c.oid,'SELECT') auth_read,
      has_table_privilege('anonymous',c.oid,'SELECT') anon_read,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) policies,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid AND
        p.polroles=ARRAY['neondb_owner'::regrole]::oid[]) owner_policies,
      (SELECT count(*)::int FROM pg_constraint f WHERE f.conrelid=c.oid AND
        f.contype='f' AND f.convalidated) valid_fks,
      (SELECT count(*)::int FROM pg_constraint f WHERE f.conrelid=c.oid AND
        f.contype='f' AND NOT f.convalidated) invalid_fks,
      (SELECT count(*)::int FROM pg_index i WHERE i.indrelid=c.oid) indexes
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','education_v30') AND c.relkind='r'
      AND c.relname IN ('instructional_learner_login_bindings',
        'qualification_person_consent_withdrawals')
  `;
  if(tables.length!==2)throw Error("Missing or duplicate protected records");
  for(const t of tables){
    const spec=expected[t.name];
    if(!spec||t.schema_name!=="public"||t.oid!==spec.oid||!t.rls||!t.forced||
      t.auth_read||t.anon_read||t.policies!==1||t.owner_policies!==1||
      t.valid_fks!==spec.fks||t.invalid_fks!==0||t.indexes!==spec.indexes)
      throw Error("RLS, identity, FK, or privileges drifted for "+t.name);
  }
  const functions=await sql`
    SELECT p.proname AS name,p.prosecdef AS definer,pg_get_functiondef(p.oid) AS body
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30'
      AND p.proname IN ('v301_instructional_login_can_read_attempt','v29_guard_subject')
  `;
  if(functions.length!==2)throw Error("Missing protected authorization routines");
  const targets={
    v301_instructional_login_can_read_attempt:"FROM public.instructional_learner_login_bindings b",
    v29_guard_subject:"FROM public.qualification_person_consent_withdrawals w",
  };
  for(const f of functions)
    if(!f.definer||!f.body.includes(targets[f.name]))
      throw Error("Protected authorization function points to old Site schema: "+f.name);
  const [denied]=await sql`
    SELECT education_v30.v301_instructional_login_can_read_attempt(
      '00000000-0000-0000-0000-000000000000'::uuid) AS can_read
  `;
  if(denied?.can_read!==false)
    throw Error("Invalid learner login binding unexpectedly authorized");
  console.log(JSON.stringify({
    verified:true,readOnly:true,main:MAIN,
    movedTables:tables.length,validatedForeignKeys:4,
    securityDefinerFunctions:functions.length,invalidAttemptDenied:true,
    forcedRls:true,directClientReadDenied:true
  },null,2));
}
main().catch(error=>{
  console.error("Protected identity cutover verification failed:",
    error instanceof Error?error.message:"unknown error");
  process.exitCode=1;
});
