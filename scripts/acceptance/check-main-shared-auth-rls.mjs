#!/usr/bin/env node
/** Read-only production-main acceptance: shared session, account and identity evidence. */
import {neon} from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const newlyProtected=new Set([
  "access_accounts","access_sessions","account_person_grants",
]);
const protectedLinks=new Set([
  "access_account_canonical_principals",
  "access_account_noncredit_principals",
  "access_adult_learning_reviews",
]);

async function main(){
  if(process.env.CAN_MAIN_SHARED_AUTH_RLS_CHECK!=="1")
    throw Error("Set CAN_MAIN_SHARED_AUTH_RLS_CHECK=1 for read-only main acceptance");
  if(!process.env.DATABASE_URL)throw Error("DATABASE_URL is required");
  const sql=neon(process.env.DATABASE_URL);
  const [identity]=await sql`
    SELECT current_setting('neon.project_id',true) project_id,
      current_setting('neon.branch_id',true) branch_id,
      current_database() db
  `;
  if(identity?.project_id!==PROJECT||identity?.branch_id!==MAIN||identity?.db!=="neondb")
    throw Error("Refusing non-production or non-main database");
  const tables=await sql`
    SELECT c.relname name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
      has_table_privilege('authenticated',c.oid,'SELECT') auth_read,
      has_table_privilege('authenticated',c.oid,'INSERT') auth_insert,
      has_table_privilege('authenticated',c.oid,'UPDATE') auth_update,
      has_table_privilege('authenticated',c.oid,'DELETE') auth_delete,
      has_table_privilege('anonymous',c.oid,'SELECT') anon_read,
      has_table_privilege('neondb_owner',c.oid,'SELECT') owner_read,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) policy_count,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid
        AND p.polpermissive=false AND
        p.polroles=ARRAY['authenticated'::regrole,'anonymous'::regrole]::oid[]
        AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL
        AND pg_get_expr(p.polqual,c.oid)='false'
        AND pg_get_expr(p.polwithcheck,c.oid)='false') AS restrictive_denies,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid
        AND p.polroles=ARRAY['neondb_owner'::regrole]::oid[]
        AND p.polcmd='*'
        AND pg_get_expr(p.polqual,c.oid)='true'
        AND pg_get_expr(p.polwithcheck,c.oid)='true') AS owner_policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND c.relname IN (
        'access_accounts','access_sessions','account_person_grants',
        'access_account_canonical_principals',
        'access_account_noncredit_principals','access_adult_learning_reviews')
  `;
  if(tables.length!==6)throw Error("Missing shared identity table");
  for(const t of tables){
    if(!t.rls||!t.force_rls||t.auth_read||t.auth_insert||t.auth_update||
      t.auth_delete||t.anon_read||!t.owner_read||t.policy_count!==1)
      throw Error("RLS or direct SQL privileges changed: "+t.name);
    if(newlyProtected.has(t.name) && t.restrictive_denies!==1)
      throw Error("Missing restrictive deny policy: "+t.name);
    if(protectedLinks.has(t.name) && t.owner_policies!==1)
      throw Error("Existing trusted-owner policy changed: "+t.name);
  }
  const [staff]=await sql`
    SELECT count(*)::int AS grants
    FROM education_v30.v301_can_staff_session_context(
      repeat('0',64)
    )
  `;
  if(staff?.grants!==0)
    throw Error("Invalid session granted staff authority");
  console.log(JSON.stringify({
    verified:true,readOnly:true,branch:MAIN,
    protectedTables:tables.length,restrictedDirectAccess:true,
    validStaffProjectionDenied:true,
    canonicalSessionRetired:false,
  },null,2));
}
main().catch(error=>{
  console.error("Main shared-auth security verification failed:",
    error instanceof Error?error.message:"unknown error");
  process.exitCode=1;
});
