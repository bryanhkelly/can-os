#!/usr/bin/env node
/**
 * Read-only native facilitated Classroom QA preflight.
 * No migration, DDL, writes, grants or role mutations occur in this script.
 *
 * Example:
 * CAN_NATIVE_CLASSROOM_PREFLIGHT=1 DATABASE_URL=<isolated QA URL> \
 *   node scripts/acceptance/preflight-native-classroom-qa.mjs
 */
import { Pool } from "@neondatabase/serverless";

if(process.env.CAN_NATIVE_CLASSROOM_PREFLIGHT!=="1"){
  throw new Error("Read-only QA check requires CAN_NATIVE_CLASSROOM_PREFLIGHT=1");
}
const url=process.env.DATABASE_URL;
if(!url)throw new Error("Explicit QA DATABASE_URL is required");
const pool=new Pool({connectionString:url,max:2});
const requirements={
  "education_v30.deployment_offering_adoptions":[
    "id","deployment_id","offering_version_id"
  ],
  "education_v30.offering_courses":["offering_version_id","course_version_id"],
  "education_v30.program_deployments":["id","operation_id","offering_id","status"],
  "education_v30.delivery_sessions":["id","deployment_id","site_id","starts_at","ends_at"],
  "education_v30.facilitated_classroom_plans":[
    "id","delivery_session_id","deployment_id","course_version_id","site_id",
    "host_organization_id","facilitator_person_id","request_id","state",
    "facilitated_session_id","enrollment_release_id"
  ],
  "education_v30.learner_course_attempts":[
    "id","enrollment_id","noncredit_registration_id","course_version_id",
    "adoption_id","offering_version_id","deployment_id","status"
  ],
};
const nativeTables=[
  "classes","class_offerings","class_offering_versions","class_enrollments",
  "class_outcomes","class_awards","class_staff_assignments","class_sessions",
  "course_activity_sets","class_activity_enrollment_pins","class_activity_submissions"
];
const problems=[];
let exitCode=0;
try{
  const sqlColumns=await pool.query(
    "SELECT table_schema,table_name,column_name FROM information_schema.columns "
    +"WHERE table_schema='education_v30' "
    +"AND table_name=ANY($1::text[])",
    [Object.keys(requirements).map(x=>x.split(".")[1])]
  );
  const have=new Set(sqlColumns.rows.map(x=>x.table_schema+"."+x.table_name+"."+x.column_name));
  for(const [table,columns] of Object.entries(requirements)){
    for(const column of columns)if(!have.has(table+"."+column))
      problems.push("missing prerequisite column "+table+"."+column);
  }
  const [native,integrity,sourceChecks,policies,roleData]=await Promise.all([
    pool.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity "
      +"FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
      +"WHERE n.nspname='education_v30' AND c.relname=ANY($1::text[])",
      [nativeTables]),
    pool.query("SELECT conrelid::regclass::text AS relation,conname,contype,"
      +"pg_get_constraintdef(oid) AS definition FROM pg_constraint "
      +"WHERE conrelid IN ('education_v30.deployment_offering_adoptions'::regclass,"
      +"'education_v30.offering_courses'::regclass) AND contype IN ('u','p')"),
    pool.query("SELECT conname,pg_get_constraintdef(oid) AS definition "
      +"FROM pg_constraint WHERE conrelid="
      +"'education_v30.learner_course_attempts'::regclass AND contype='c'"),
    pool.query("SELECT tablename,policyname,roles,cmd "
      +"FROM pg_policies WHERE schemaname='education_v30' "
      +"AND tablename=ANY($1::text[])",[nativeTables]),
    pool.query("SELECT rolname,rolcanlogin,rolbypassrls FROM pg_roles "
      +"WHERE rolname IN ('neondb_owner','can_os_canonical_auth_app')")
  ]);
  const constraints=new Set(integrity.rows.map(x=>x.relation+":"+x.definition));
  if(![...constraints].some(x=>
    x.includes("deployment_offering_adoptions:UNIQUE (id, deployment_id, offering_version_id)")))
    problems.push("composite adoption FK target is missing");
  if(![...constraints].some(x=>
    x.includes("offering_courses:PRIMARY KEY (offering_version_id, course_version_id)")
    ||x.includes("offering_courses:UNIQUE (offering_version_id, course_version_id)")))
    problems.push("composite Course-offering FK target is missing");
  const nativeSet=new Set(native.rows.map(x=>x.relname));
  const missingNative=nativeTables.filter(x=>!nativeSet.has(x));
  const installedNative=nativeTables.filter(x=>nativeSet.has(x));
  const twoSource=sourceChecks.rows.filter(x=>x.definition.includes("num_nonnulls")
    &&x.definition.includes("enrollment_id")
    &&x.definition.includes("noncredit_registration_id")
    &&!x.definition.includes("class_enrollment_id"));
  const nativeSource=sourceChecks.rows.filter(x=>x.conname==="native_course_attempt_one_source_ck"
    &&x.definition.includes("class_enrollment_id"));
  if(missingNative.length>0 && twoSource.length!==1)
    problems.push("expected exactly one pre-migration Course Attempt source constraint");
  if(installedNative.length>0&&missingNative.length>0)
    problems.push("partially installed native Class schema, review manually");
  for(const table of native.rows){
    if(!table.relrowsecurity||!table.relforcerowsecurity)
      problems.push("native table RLS is not forced: "+table.relname);
  }
  const report={
    readOnly:true,
    database:"education_v30",
    native:{installed:installedNative,missing:missingNative},
    sourceCheck:{legacyTwoSourceCount:twoSource.length,nativeThreeSourceCount:nativeSource.length},
    nativePolicies:policies.rows.map(x=>({
      table:x.tablename,name:x.policyname,roles:x.roles,command:x.cmd
    })),
    availableRoles:roleData.rows,
    prerequisiteConstraints:integrity.rows.map(x=>({relation:x.relation,def:x.definition})),
    releaseBlockers:[
      ...problems,
      ...(missingNative.length
        ?["native Class tables not installed"]
        :[]),
      ...(installedNative.length&&policies.rows.every(x=>String(x.roles).includes("neondb_owner"))
        ?["new Class tables do not have independently reviewed application-role RLS"]
        :[]),
    ],
    next:"Apply reviewed migrations on a disposable isolated QA branch and prove restricted app-role E2E; never enable from this preflight alone.",
  };
  console.log(JSON.stringify(report,null,2));
  exitCode=report.releaseBlockers.length>0?1:0;
}catch(error){
  console.error("Native Class QA prerequisite inspection failed:",error?.message??error);
  exitCode=2;
}finally{
  await pool.end();
}
process.exitCode=exitCode;
