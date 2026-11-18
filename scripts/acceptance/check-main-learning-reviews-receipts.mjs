#!/usr/bin/env node
/**
 * Read-only main-only acceptance for original asset-review and waitlist receipt tables.
 * This checks physical table locations, protected privileges, FKs and owned identity sequence.
 * It never modifies data or provisions accounts.
 */
import {neon} from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const expected={
  published_asset_reviews:3,
  noncredit_waitlist_email_deliveries:1,
};

async function main(){
  if(process.env.CAN_MAIN_LEARNING_REVIEWS_RECEIPTS_CHECK!=="1")
    throw Error("Explicit CAN_MAIN_LEARNING_REVIEWS_RECEIPTS_CHECK=1 required");
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
    SELECT c.relname AS name,n.nspname AS schema_name,
      c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
      has_table_privilege('authenticated',c.oid,'SELECT') AS client_read,
      has_table_privilege('anonymous',c.oid,'SELECT') AS anon_read,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid
         AND p.polroles=ARRAY['neondb_owner'::regrole]::oid[]) AS owner_policies,
      (SELECT count(*)::int FROM pg_constraint fk WHERE fk.conrelid=c.oid
         AND fk.contype='f' AND fk.convalidated) AS fks,
      (SELECT count(*)::int FROM pg_constraint fk WHERE fk.conrelid=c.oid
         AND fk.contype='f' AND NOT fk.convalidated) AS invalid_fks
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','education_v30') AND c.relkind IN ('r','p')
      AND c.relname IN ('published_asset_reviews','noncredit_waitlist_email_deliveries')
  `;
  if(tables.length!==2)throw Error("Missing or duplicated physical tables");
  for(const t of tables){
    if(t.schema_name!=="public"||t.rls!==true||t.forced!==true||
       t.client_read!==false||t.anon_read!==false||t.policies!==1||
       t.owner_policies!==1||t.invalid_fks!==0||t.fks!==expected[t.name])
      throw Error("Source, policy, grants or FK mismatch for "+t.name);
  }
  const [identitySequence]=await sql`
    SELECT pg_get_serial_sequence(
      'public.published_asset_reviews','decision_order') AS owned_sequence
  `;
  if(identitySequence?.owned_sequence!=="public.published_asset_reviews_decision_order_seq")
    throw Error("Asset review identity sequence is not preserved in public");

  console.log(JSON.stringify({
    verified:true,project:PROJECT,branch:MAIN,readOnly:true,
    movedTables:tables.length,validatedForeignKeys:tables.reduce((n,t)=>n+t.fks,0),
    forcedRls:true,identitySequenceVerified:true
  },null,2));
}
main().catch(error=>{
  console.error("Main learning review/waitlist acceptance failed:",
    error instanceof Error?error.message:"unknown error");
  process.exitCode=1;
});
