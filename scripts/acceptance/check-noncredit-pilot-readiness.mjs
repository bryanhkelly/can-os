#!/usr/bin/env node
/**
 * Read-only readiness check for an ISOLATED canonical v3.0.1 acceptance DB.
 * Does not apply migrations, insert records or mutate production data.
 *
 * APP_ENV=test TEST_DATABASE_URL=... node scripts/acceptance/check-noncredit-pilot-readiness.mjs
 */
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { endpoint } from "../isolated-test-db-guard.mjs";

if (existsSync(".env.local")) loadEnvFile(".env.local");
const fail=message=>{throw new Error("Noncredit acceptance refused: "+message);};
async function run() {
  if(process.env.APP_ENV!=="test"||process.env.NODE_ENV==="production")
    fail("APP_ENV=test and non-production runtime are required");
  const testUrl=process.env.TEST_DATABASE_URL;
  if(!testUrl)fail("TEST_DATABASE_URL must point to an isolated database");
  const target=endpoint(testUrl,fail);
  if(process.env.DATABASE_URL&&endpoint(process.env.DATABASE_URL,fail)===target)
    fail("Test endpoint must differ from the application database");
  if(process.env.CAN_APPLICATION_DB_HOST &&
     target===process.env.CAN_APPLICATION_DB_HOST.replace(/-pooler(?=\.)/,""))
    fail("Test endpoint must differ from the application host");
  const pool=new Pool({connectionString:testUrl,max:1});
  const db=await pool.connect();
  try {
    await db.query("BEGIN TRANSACTION READ ONLY");
    const {rows:definitions}=await db.query(`
      SELECT
        pg_get_functiondef('education_v30.v28_validate_completion()'::regprocedure) AS completion,
        pg_get_functiondef('education_v30.v301_provision_noncredit_knowledge_access(uuid)'::regprocedure) AS provisioning,
        pg_get_functiondef('education_v30.v301_noncredit_attempt_access_trigger()'::regprocedure) AS attempt_trigger,
        pg_get_functiondef('education_v30.v301_noncredit_admin_access_trigger()'::regprocedure) AS administration_trigger
    `);
    const defs=definitions[0];
    const requirements=[
      ["verified participation",defs.completion.includes("JOIN evidence_document_versions v") &&
        defs.completion.includes("v.verified_at IS NOT NULL") &&
        defs.completion.includes("v.verified_by_person_id IS NOT NULL")],
      ["time-valid evidence",defs.completion.includes("v.valid_through") &&
        defs.completion.includes("e.occurred_at<=NEW.decided_at")],
      ["same-course assessment",defs.completion.includes("ca.noncredit_registration_id=NEW.registration_id") &&
        defs.completion.includes("grant_row.access_status='approved'")],
      ["configurable lessons",defs.completion.includes("pol.require_all_lessons")],
      ["enrollment-independent grant",defs.provisioning.includes("ca.enrollment_id IS NULL") &&
        defs.provisioning.includes("ON CONFLICT")],
      ["provider publication",defs.provisioning.includes("t.approved_by_person_id IS NOT NULL") &&
        defs.provisioning.includes("t.state='published'")],
    ];
    const {rows:triggers}=await db.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid IN (
        'education_v30.learner_course_attempts'::regclass,
        'education_v30.assessment_administrations'::regclass,
        'education_v30.noncredit_completion_decisions'::regclass
      ) AND NOT tgisinternal
    `);
    const installed=new Set(triggers.map(row=>row.tgname));
    for(const trigger of [
      "v301_noncredit_attempt_assessment_access",
      "v301_noncredit_admin_assessment_access",
      "noncredit_completion_authority",
    ]) requirements.push([trigger,installed.has(trigger)]);

    const {rows:rls}=await db.query(`
      SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='education_v30'
        AND c.relname=ANY($1::text[])
    `,[["noncredit_registrations","learner_course_attempts",
       "assessment_access_grants","assessment_attempts","survey_responses"]]);
    const secure=new Set(rls.filter(r=>r.relrowsecurity && r.relforcerowsecurity).map(r=>r.relname));
    requirements.push(["restricted participant and assessment tables",
      secure.has("noncredit_registrations")&&secure.has("learner_course_attempts") &&
      secure.has("assessment_access_grants")&&secure.has("assessment_attempts")]);
    for(const [name,pass] of requirements)console.log((pass?"PASS":"FAIL")+": "+name);
    if(requirements.some(([_,pass])=>!pass))fail("Database acceptance requirements not satisfied");
    console.log("Read-only isolated canonical noncredit schema check passed.");
  }finally {
    await db.query("ROLLBACK").catch(()=>undefined);
    db.release();
    await pool.end();
  }
}
run().catch(error=>{
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
});
