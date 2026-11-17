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
  // Capabilities are always active in code. QA readiness is a material
  // schema, grant, authorization and fixture check, not a feature toggle.
  const expectedBranch=required("CAN_E2E_TEST_BRANCH_ID");
  await verifyAdmissionsNeonBranch({
    ...env, CAN_ADMISSIONS_TEST_BRANCH_ID:expectedBranch,
  });
  // The one-account / one-Class P0 test is independently runnable.
  // Full WS00 pilot acceptance still requires both four-session Site pilots.
  const singleLoginOnly=env.CAN_WS00_QA_SCOPE==="single_login_class";
  const ids=singleLoginOnly
    ?[required("CAN_WS00_QA_ONE_HOUR_CLASS_ID")]
    :[
      required("CAN_WS00_QA_ONE_HOUR_CLASS_ID"),
      required("CAN_WS00_QA_FOUR_SESSION_CLASS_A_ID"),
      required("CAN_WS00_QA_FOUR_SESSION_CLASS_B_ID"),
    ];
  if(ids.some(id=>!uuid.test(id))||new Set(ids).size!==ids.length)
    throw new Error("WS00 QA requires distinct real canonical Class UUIDs");
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
  // A first-time adult must be genuinely new and separately reviewed, not a
  // synthetic native cookie or an age claim supplied by the browser.
  const freshAccountId=required("CAN_WS00_QA_FRESH_LEARNER_CAN_ACCOUNT_ID");
  if(!uuid.test(freshAccountId))
    throw new Error("WS00 fresh CAN adult fixture needs a valid account UUID");
  const [reviewSchema]=await sql`
    SELECT to_regclass('public.access_adult_learning_reviews') IS NOT NULL AS exists,
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='access_adult_learning_reviews'
          AND c.relrowsecurity AND c.relforcerowsecurity) AS forced_rls
  `;
  if(!reviewSchema?.exists||!reviewSchema.forced_rls)
    throw new Error("WS00 QA missing reviewed adult onboarding schema or FORCE RLS");
  const [fresh]=await sql`
    SELECT a.id,review.access_person_id,review.status,
      review.consumed_at,review.canonical_account_id,
      reviewer.email_verified_at AS reviewer_verified,
      reviewer.disabled AS reviewer_disabled,
      o.status AS home_org_status
    FROM public.access_accounts a
    JOIN public.access_adult_learning_reviews review ON
      review.access_account_id=a.id AND review.access_person_id=a.person_id
    JOIN public.access_accounts reviewer ON reviewer.id=review.reviewed_by_account_id
    JOIN education_v30.organizations o ON o.id=review.organization_id
    WHERE a.id=${freshAccountId}::uuid
      AND a.email_verified_at IS NOT NULL AND a.disabled=false
      AND reviewer.id<>a.id
      AND review.reviewed_at <= now()
      AND review.reviewed_at > now() - interval '365 days'
      AND review.verified_birth_date <= current_date - interval '18 years'
      AND review.verified_birth_date >= current_date - interval '125 years'
      AND NOT EXISTS(SELECT 1 FROM public.access_account_noncredit_principals p
        WHERE p.access_account_id=a.id)
      AND NOT EXISTS(SELECT 1 FROM education_v30.canonical_accounts n
        WHERE n.email_normalized=a.email_normalized)
      AND EXISTS(SELECT 1 FROM public.account_person_grants g
        WHERE g.account_id=a.id AND g.person_id=a.person_id AND g.active)
      AND NOT EXISTS(SELECT 1 FROM public.account_person_grants g
        WHERE g.account_id=a.id AND g.active AND
          (g.person_id<>a.person_id OR g.role='student'))
  `;
  if(!fresh||fresh.status!=="approved"||fresh.consumed_at||
     fresh.canonical_account_id||!fresh.reviewer_verified||
     fresh.reviewer_disabled||fresh.home_org_status!=="active")
    throw new Error("WS00 QA requires unused independently reviewed CAN-only adult fixture");
  const rows=singleLoginOnly
    ?await sql`SELECT id::text AS id,site_id::text AS site_id,
      course_version_id::text AS course_version_id,state
      FROM education_v30.classes WHERE id=${ids[0]}::uuid`
    :await sql`SELECT id::text AS id,site_id::text AS site_id,
      course_version_id::text AS course_version_id,state
      FROM education_v30.classes
      WHERE id IN (${ids[0]}::uuid,${ids[1]}::uuid,${ids[2]}::uuid)`;
  if(rows.length!==ids.length||rows.some(row=>
       !row.site_id||!row.course_version_id||row.state!=="active"))
    throw new Error("WS00 QA requires active, Site-bound, Course-version-pinned Classes");
  if(!singleLoginOnly){
    const siteA=rows.find(row=>row.id===ids[1])?.site_id;
    const siteB=rows.find(row=>row.id===ids[2])?.site_id;
    if(!siteA||!siteB||siteA===siteB)
      throw new Error("WS00 four-Session pilot must use two distinct approved delivery Sites");
    const counts=await sql`
      SELECT class_id::text AS class_id,count(*)::integer AS sessions
      FROM education_v30.class_sessions
      WHERE class_id IN (${ids[1]}::uuid,${ids[2]}::uuid)
      GROUP BY class_id
    `;
    for(const id of ids.slice(1)){
      if((counts.find(row=>row.class_id===id)?.sessions??0)<4)
        throw new Error("WS00 QA requires at least four canonical Sessions per local pilot Class");
    }
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
    branchId:expectedBranch,scope:singleLoginOnly?"single_login_class":"full_ws00",
    oneHourClasses:1,fourSessionClasses:singleLoginOnly?0:2,
    distinctDeliverySites:singleLoginOnly?0:2,
    minimumSessionsPerPilotClass:singleLoginOnly?0:4,forcedRlsTables:5,
    reviewedFreshAdultFixture:true,reviewedAdultForceRls:true,
    actualSignedInE2ePassed:false,
  },null,2));
}
run().catch(err=>{
  console.error("WS00 QA NO-GO: "+(err instanceof Error?err.message:String(err)));
  process.exitCode=1;
});
