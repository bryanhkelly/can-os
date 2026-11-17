#!/usr/bin/env node
/**
 * WS00 source-backed QA preflight. Read-only.
 * Never seeds data, applies migrations, bypasses RLS or writes to production.
 * A passing preflight is necessary but never sufficient for E2E acceptance.
 */
import {neon} from "@neondatabase/serverless";
import {verifyAdmissionsNeonBranch} from "../verify-admissions-neon-branch.mjs";

const env=process.env;
const required = key=>{
  const value=env[key];
  if(!value)throw new Error("WS00 QA preflight missing "+key);
  return value;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function run(){
  if(env.APP_ENV!=="test" || env.NODE_ENV!=="test" ||
     env.CAN_WS00_QA_RUN!=="1" ||
     env.CAN_TEST_DB_WRITES_ENABLED!=="true")
    throw new Error("WS00 QA requires explicit isolated test environment and approval flags");
  const url=required("TEST_DATABASE_URL");
  if(env.DATABASE_URL!==url)
    throw new Error("WS00 QA application and tests must target the same isolated database");
  const expectedBranch=required("CAN_E2E_TEST_BRANCH_ID");
  await verifyAdmissionsNeonBranch({
    ...env, CAN_ADMISSIONS_TEST_BRANCH_ID:expectedBranch,
  });
  const ids=[
    required("CAN_WS00_QA_ONE_HOUR_CLASS_ID"),
    required("CAN_WS00_QA_FOUR_SESSION_CLASS_A_ID"),
    required("CAN_WS00_QA_FOUR_SESSION_CLASS_B_ID"),
  ];
  if(ids.some(id=>!uuid.test(id))||new Set(ids).size!==3)
    throw new Error("WS00 QA needs three distinct real test-only canonical Class UUIDs");
  const sql=neon(url);
  const [schema]=await sql`
    SELECT
      to_regclass('education_v30.class_completion_policy_versions') IS NOT NULL AS ws3_policy,
      to_regclass('education_v30.class_enrollment_completion_pins') IS NOT NULL AS ws3_pins,
      to_regclass('education_v30.learning_completion_evidence_review_requests') IS NOT NULL AS ws3_review,
      to_regclass('education_v30.class_session_agenda_revisions') IS NOT NULL AS ws4_agendas
  `;
  if(!schema || Object.values(schema).some(value=>value!==true))
    throw new Error("WS00 QA missing migrated WS3/WS4 governance schema; no E2E acceptance");
  const rows=await sql`
    SELECT id::text AS id,site_id::text AS site_id,
           course_version_id::text AS course_version_id,state
    FROM education_v30.classes
    WHERE id=ANY(${ids}::uuid[])
  `;
  if(rows.length!==3||rows.some(row=>!row.site_id||!row.course_version_id||row.state!=="active"))
    throw new Error("WS00 QA requires three active, Site-bound, Course-version-pinned Classes");
  if(rows[1].id===rows[2].id)throw new Error("Distinct Class IDs required");
  const siteA=rows.find(row=>row.id===ids[1])?.site_id;
  const siteB=rows.find(row=>row.id===ids[2])?.site_id;
  if(!siteA||!siteB||siteA===siteB)
    throw new Error("WS00 four-Session pilot must use two distinct approved delivery Sites");
  const counts=await sql`
    SELECT class_id::text AS class_id,count(*)::integer AS sessions
    FROM education_v30.class_sessions
    WHERE class_id=ANY(${[ids[1],ids[2]]}::uuid[])
    GROUP BY class_id
  `;
  for(const id of ids.slice(1)){
    if((counts.find(row=>row.class_id===id)?.sessions??0)<4)
      throw new Error("WS00 QA requires at least four canonical Sessions per local pilot Class");
  }
  const [security]=await sql`
    SELECT count(*)::integer AS forced_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='education_v30'
      AND c.relname IN ('classes','class_sessions','class_enrollments',
        'class_completion_policy_versions','class_session_agenda_revisions')
      AND c.relrowsecurity AND c.relforcerowsecurity
  `;
  if(Number(security?.forced_rls)!==5)
    throw new Error("WS00 QA found missing FORCE RLS on required canonical relations");
  console.log(JSON.stringify({
    gate:"WS00 isolated QA source-fixture readiness", passed:true,
    branchId:expectedBranch,oneHourClasses:1,
    fourSessionClasses:2,distinctDeliverySites:2,
    minimumSessionsPerPilotClass:4,forcedRlsTables:5,
    actualSignedInE2ePassed:false,
  },null,2));
}
run().catch(err=>{
  console.error("WS00 QA NO-GO: "+(err instanceof Error?err.message:String(err)));
  process.exitCode=1;
});
