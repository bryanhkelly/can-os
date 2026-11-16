#!/usr/bin/env node
/**
 * Read-only acceptance. Never creates an assessment, role, grant, schema,
 * learner, authorization, ciphertext or audit record.
 * Requires a disposable isolated QA database and an explicit Organization ID.
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

if(process.env.CAN_CANONICAL_ASSESSMENT_DRAFT_PREFLIGHT!=="1")
  throw new Error("Set CAN_CANONICAL_ASSESSMENT_DRAFT_PREFLIGHT=1");
if(!process.env.DATABASE_URL)
  throw new Error("An explicit disposable QA DATABASE_URL is required");
const org=process.env.CAN_CANONICAL_ASSESSMENT_QA_ORGANIZATION_ID;
if(!org||!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(org))
  throw new Error("Specify CAN_CANONICAL_ASSESSMENT_QA_ORGANIZATION_ID as UUID");
const role="can_v30_assess_draft_author_"+org.replaceAll("-","").toLowerCase();
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
const problems=[];
try{
  const {rows:roles}=await pool.query(
    "SELECT rolname,rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1",
    [role]);
  const draft=roles[0];
  if(!draft)problems.push("optional Organization-bound assessment role not provisioned");
  else if(draft.rolcanlogin||draft.rolinherit||draft.rolbypassrls||
      draft.rolsuper||draft.rolcreatedb||draft.rolcreaterole)
    problems.push("assessment draft role is privileged or inheriting");

  const signatures=[
    "education_v30.v301_create_objective_assessment_draft(uuid,uuid,uuid,text,text,numeric,integer,jsonb)",
    "education_v30.v301_list_objective_assessment_drafts(uuid,uuid)",
  ];
  const {rows:funcs}=await pool.query(
    `SELECT p.oid::regprocedure::text AS signature,
            EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,
              acldefault('f',p.proowner))) a WHERE a.grantee=0) AS public_execute
     FROM pg_proc p WHERE p.oid=ANY($1::regprocedure[])`,
    [signatures],
  ).catch(error=>{
    problems.push("canonical assessment writer functions not installed: "+error.message);
    return {rows:[]};
  });
  if(funcs.length!==signatures.length)problems.push("missing canonical assessment draft functions");
  if(funcs.some(f=>f.public_execute))
    problems.push("PUBLIC must not execute canonical draft writer functions");

  const {rows:secrets}=await pool.query(
    `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='education_v30' AND c.relname='assessment_item_secure_keys'`);
  if(secrets.length!==1||!secrets[0].relrowsecurity||!secrets[0].relforcerowsecurity)
    problems.push("answer key table must have ENABLE and FORCE RLS");

  if(draft){
    const privileges=[
      ["education_v30.assessment_item_secure_keys","SELECT"],
      ["education_v30.assessment_versions","UPDATE"],
      ["education_v30.assessment_administrations","INSERT"],
      ["education_v30.assessment_attempt_results","SELECT"],
      ["education_v30.assessment_definitions","INSERT"],
    ];
    for(const [relation,privilege] of privileges){
      const {rows}=await pool.query(
        "SELECT has_table_privilege($1,$2,$3) AS allowed",
        [role,relation,privilege],
      );
      if(rows[0]?.allowed)
        problems.push("draft-only role has forbidden "+privilege+" on "+relation);
    }
    for(const signature of signatures){
      try{
        const {rows}=await pool.query(
          "SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",
          [role,signature],
        );
        if(!rows[0]?.allowed)
          problems.push("draft-only role cannot execute "+signature);
      }catch(error){problems.push("missing function grant: "+error.message);}
    }
    const {rows:bindings}=await pool.query(
      `SELECT 1 FROM education_v30.database_role_organization_bindings
       WHERE db_role=$1 AND organization_id=$2::uuid
         AND purpose_code='assessment_draft_author' AND status='approved'
         AND valid_from<=clock_timestamp()
         AND (valid_through IS NULL OR valid_through>clock_timestamp()) LIMIT 1`,
      [role,org],
    );
    if(!bindings.length)
      problems.push("no currently approved assessment_draft_author Organization binding");
  }
  console.log(JSON.stringify({
    readOnly:true,organizationId:org,writerRole:role,
    installedFunctions:funcs,
    answerKeyRls:secrets[0]??null,
    blockers:problems,
    note:"A read-only preflight is not proof that draft creation, decryption, independent review or Class E2E passed.",
  },null,2));
  if(problems.length)process.exitCode=1;
}catch(error){
  console.error("Canonical objective draft QA preflight failed:",error.message);
  process.exitCode=2;
}finally{await pool.end();}
