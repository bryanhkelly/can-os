#!/usr/bin/env node
/**
 * WS2 canonical public Class enrollment preflight. READ ONLY. Never creates learners,
 * sessions, grants, invitations, Class rows, or migration ledger entries.
 *
 * Requires an explicit known nonproduction Neon branch attested by PostgreSQL.
 * Both schema checks and the optional two-Site/four-Session fixture check use
 * one READ ONLY transaction. A lack of fixtures is a blocked journey, not pass.
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

const projectId=process.env.CAN_WS2_QA_PROJECT_ID;
const branchId=process.env.CAN_WS2_QA_BRANCH_ID;
const url=process.env.CAN_WS2_QA_DATABASE_URL;
const requireJourney=process.argv.includes("--require-journey-fixtures");
const requireIntents=process.argv.includes("--require-enrollment-intents");
const productionBranch="br-restless-sea-ar9ooo55";
if(process.env.CAN_WS2_QA_READ_ONLY!=="1" || !url ||
   !projectId || !branchId ||
   !/^br-[a-z0-9-]+$/.test(branchId) || branchId===productionBranch){
  throw new Error("WS2 isolated read-only QA requires explicit project, nonproduction branch, URL and CAN_WS2_QA_READ_ONLY=1");
}
const pool=new Pool({connectionString:url,max:1});
let connection;
try{
  connection=await pool.connect();
  await connection.query("BEGIN TRANSACTION READ ONLY");
  const query=(sql,params=[])=>connection.query(sql,params);
  const {rows:[identity]}=await query(
    "SELECT current_setting('neon.branch_id',true) AS branch_id, current_setting('neon.project_id',true) AS project_id, current_setting('transaction_read_only') AS read_only",
  );
  assert.equal(identity?.branch_id,branchId,"Connection is not the nominated QA branch");
  assert.equal(identity?.project_id,projectId,"Connection is not the nominated QA project");
  assert.equal(identity?.read_only,"on","QA connection is not read-only");
  const names=[
    "classes","class_offerings","class_offering_versions","class_enrollments",
    "learner_course_attempts","class_sessions","audit_events","domain_events",
    "participation_attributions",
  ];
  const relations=await query(`
    SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname=ANY($1::text[])
  `,[names]);
  assert.equal(relations.rows.length,names.length,"Missing canonical public Class relation");
  for(const table of relations.rows){
    assert(table.relrowsecurity && table.relforcerowsecurity,
      "Missing enforced Class RLS: "+table.relname);
  }

  const index=await query(`
    SELECT indexdef FROM pg_indexes WHERE schemaname='public'
    AND tablename='class_enrollments'
    AND indexname='canonical_class_enroll_active_uq'
  `);
  assert.equal(index.rows.length,1,"Open Class Enrollment unique index is missing");
  assert(index.rows[0].indexdef.includes("learner_person_id") &&
    index.rows[0].indexdef.includes("pending") &&
    index.rows[0].indexdef.includes("active"),
    "Open Class Enrollment uniqueness does not cover pending and active");

  const guards=[
    "class_enrollment_attempt_guard",
    "canonical_class_enrollment_identity_guard_trg",
    "learner_course_attempt_source_gate",
    "v301_class_attribution_required",
    "participation_attribution_history_guard",
  ];
  const triggers=await query(`
    SELECT t.tgname FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND t.tgenabled<>'D'
      AND NOT t.tgisinternal AND t.tgname=ANY($1::text[])
  `,[guards]);
  for(const name of guards){
    assert(triggers.rows.some(x=>x.tgname===name),"Missing active Class guard "+name);
  }
  const intentRelations=[
    "class_enrollment_invitations","class_enrollment_approval_requests",
    "class_enrollment_transfer_requests","class_enrollment_repeat_authorizations",
  ];
  const installedIntents=await query(`
    SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])
  `,[intentRelations]);
  const installedNames=new Set(installedIntents.rows.map(row=>row.relname));
  const missingIntents=intentRelations.filter(name=>!installedNames.has(name));
  const approvalContract=await query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid=to_regclass('public.class_enrollment_approval_requests')
      AND conname='ws2_approval_acceptance_only_after_review'
  `);
  const adultApprovalMigrationReady=approvalContract.rows.length===1;
  const consentContract=await query(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid=to_regclass('public.class_enrollments')
      AND conname='canonical_class_enrollment_consent_ck'
  `);
  const nativeConsentMethodsReady=consentContract.rows.length===1&&
    consentContract.rows[0].definition.includes("invitation")&&
    consentContract.rows[0].definition.includes("approval");

  if(requireIntents){
    assert.equal(missingIntents.length,0,
      "Native enrollment-intent migrations are missing: "+missingIntents.join(", "));
    for(const relation of installedIntents.rows){
      assert(relation.relrowsecurity&&relation.relforcerowsecurity,
        "Missing forced enrollment-intent RLS: "+relation.relname);
    }
    assert(adultApprovalMigrationReady,
      "Adult approval lifecycle migration is absent or not applied");
    assert(nativeConsentMethodsReady,
      "Native invitation and approval consent constraints are not deployed");
  }
  const facts=await query(`
    SELECT
      (SELECT count(*)::int FROM public.classes) AS classes,
      (SELECT count(*)::int FROM public.class_enrollments) AS enrollments,
      (SELECT count(*)::int FROM public.class_sessions) AS sessions,
      (SELECT count(*)::int FROM public.learner_course_attempts
        WHERE class_enrollment_id IS NOT NULL) AS course_attempts
  `);
  const summary=facts.rows[0];
  if(requireJourney){
    const sites=await query(`
      SELECT c.site_id,count(DISTINCT c.id)::int AS class_count,
        count(DISTINCT cs.id)::int AS session_count,
        count(DISTINCT e.id)::int AS enrollment_count
      FROM public.classes c
      LEFT JOIN public.class_sessions cs ON cs.class_id=c.id
      LEFT JOIN public.class_enrollments e ON e.class_id=c.id
      WHERE c.site_id IS NOT NULL
      GROUP BY c.site_id
      HAVING count(DISTINCT cs.id)>=4 AND count(DISTINCT e.id)>=1
      ORDER BY c.site_id LIMIT 3
    `);
    assert(sites.rows.length>=2,
      "Blocked: no two distinct authorized synthetic Sites with four Sessions and enrolled Persons. Do not certify the 4-session pilot.");
  }
  console.log(JSON.stringify({
    outcome:"read-only-schema-verified",
    projectId,branchId,readOnly:true,identityChecked:true,
    structuralGuards:guards.length,
    missingEnrollmentIntentTables:missingIntents,
    adultApprovalMigrationReady,nativeConsentMethodsReady,
    fixtureCounts:summary,
    twoSiteFourSession:requireJourney?"fixture-shape-present-only":"NOT_TESTED",
    commandAuthorization:"NOT_TESTED",
    concurrentSeatRace:"NOT_TESTED",
    browser:"NOT_TESTED",
  },null,2));
  await connection.query("COMMIT");
}catch(error){
  if(connection)await connection.query("ROLLBACK").catch(()=>{});
  throw error;
}finally{
  connection?.release();
  await pool.end();
}
