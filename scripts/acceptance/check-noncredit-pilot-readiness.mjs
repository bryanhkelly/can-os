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
        pg_get_functiondef('education_v30.v301_noncredit_admin_access_trigger()'::regprocedure) AS administration_trigger,
        pg_get_functiondef('education_v30.v301_try_auto_complete_noncredit(uuid)'::regprocedure) AS automatic_completion,
        pg_get_functiondef('education_v30.v301_lock_noncredit_completion_policy()'::regprocedure) AS policy_lock
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
      ["locked completion version",defs.completion.includes("row_registration.completion_policy_id") &&
        defs.policy_lock.includes("immutable after registration")],
      ["provider-opted automation",defs.automatic_completion.includes("completion_mode='automatic'") &&
        defs.automatic_completion.includes("decision_source")],
      ["verified automatic evidence",defs.automatic_completion.includes("v.verified_by_person_id IS NOT NULL") &&
        defs.automatic_completion.includes("v.valid_through")],
      ["course-bound automatic assessment",defs.automatic_completion.includes("ca.noncredit_registration_id=p_registration")],
      ["optional paired diagnostic",defs.provisioning.includes("baseline_assessment_version_id")],
      ["enrollment-independent grant",defs.provisioning.includes("ca.enrollment_id IS NULL") &&
        defs.provisioning.includes("ON CONFLICT")],
      ["provider publication",defs.provisioning.includes("t.approved_by_person_id IS NOT NULL") &&
        defs.provisioning.includes("t.state='published'")],
    ];
    // The cutover moved these tables to public. Check the exact parent and
    // firing mode of every required trigger, not just the first three tables.
    const expectedTriggers=[
      ["learner_course_attempts","v301_noncredit_attempt_assessment_access"],
      ["assessment_administrations","v301_noncredit_admin_assessment_access"],
      ["noncredit_completion_decisions","noncredit_completion_authority"],
      ["noncredit_registrations","noncredit_registration_policy_pin"],
      ["noncredit_participation_events","v301_noncredit_auto_on_participation"],
      ["learner_lesson_progress","v301_noncredit_auto_on_lesson"],
      ["assessment_attempts","v301_noncredit_auto_on_assessment"],
      ["assessment_attempts","v301_noncredit_knowledge_feedback"],
      ["survey_campaigns","noncredit_feedback_campaign_scope"],
      ["learner_course_attempts","v301_noncredit_auto_on_course"],
      ["evidence_document_versions","v301_noncredit_auto_on_evidence"],
      ["noncredit_self_enrollment_claims","v301_noncredit_attribution_required"],
    ];
    const {rows:triggers}=await db.query(`
      SELECT c.relname,t.tgname,t.tgenabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal
        AND t.tgname=ANY($1::text[])
    `,[expectedTriggers.map(([,name])=>name)]);
    const installed=new Set(triggers.filter(r=>["O","A"].includes(r.tgenabled))
      .map(row=>row.relname+":"+row.tgname));
    for(const [table,trigger] of expectedTriggers)
      requirements.push([table+"."+trigger,installed.has(table+":"+trigger)]);
    requirements.push(["UUID-compatible assessment administration lookup",
      defs.provisioning.includes("min(ad.id::text)::uuid") &&
      !defs.provisioning.includes("min(ad.id)") &&
      defs.provisioning.includes("IF administration_count=1 THEN") &&
      defs.provisioning.includes("VALUES(selected_administration_id,person_learner")]);
    const {rows:uuidCases}=await db.query(`
      WITH cases(kind,id) AS (VALUES
        ('one','10000000-0000-4000-8000-000000000001'::uuid),
        ('multiple','10000000-0000-4000-8000-000000000001'::uuid),
        ('multiple','10000000-0000-4000-8000-000000000002'::uuid)),
      labels(kind) AS (VALUES ('zero'),('one'),('multiple'))
      SELECT labels.kind,count(cases.id)::int AS candidates,
        min(cases.id::text)::uuid AS chosen
      FROM labels LEFT JOIN cases USING(kind)
      GROUP BY labels.kind
    `);
    requirements.push(["zero/one/multiple administration ambiguity",
      uuidCases.find(r=>r.kind==="zero")?.chosen===null &&
      uuidCases.find(r=>r.kind==="one")?.candidates===1 &&
      uuidCases.find(r=>r.kind==="multiple")?.candidates===2]);
    const {rows:rls}=await db.query(`
      SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public'
        AND c.relname=ANY($1::text[])
    `,[["noncredit_registrations","learner_course_attempts",
       "assessment_access_grants","assessment_attempts","survey_responses",
       "noncredit_self_enrollment_claims","noncredit_completion_decisions","noncredit_participation_events"]]);
    const secure=new Set(rls.filter(r=>r.relrowsecurity && r.relforcerowsecurity).map(r=>r.relname));
    requirements.push(["restricted participant and assessment tables",
      secure.has("noncredit_registrations")&&secure.has("learner_course_attempts") &&
      secure.has("assessment_access_grants")&&secure.has("assessment_attempts")&&
      secure.has("survey_responses")&&secure.has("noncredit_self_enrollment_claims")&&
      secure.has("noncredit_completion_decisions")&&secure.has("noncredit_participation_events")]);
    const {rows:columns}=await db.query(`
      SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public'
        AND (
          (table_name='noncredit_registrations' AND column_name='completion_policy_id')
          OR (table_name='noncredit_completion_policies' AND column_name='completion_mode')
          OR (table_name='noncredit_completion_decisions' AND column_name='decision_source')
          OR (table_name='noncredit_training_versions' AND column_name='baseline_assessment_version_id')
        )
    `);
    requirements.push(["versioned noncredit policy and optional baseline columns",columns.length===4]);
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
