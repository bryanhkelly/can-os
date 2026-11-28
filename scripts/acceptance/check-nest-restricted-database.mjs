// Read-only restricted-login and RLS preflight on the independently attested QA branch.
// This does not certify tenant policies under the general business connection.
import assert from "node:assert/strict";
import {neon} from "@neondatabase/serverless";
import {verifyAdmissionsNeonBranch} from "../verify-admissions-neon-branch.mjs";
const env=process.env;
try{
 assert.equal(env.APP_ENV,"test");assert.equal(env.NODE_ENV,"test");
 assert.equal(env.CAN_PILOT_QA_BRANCH_ID,"br-solitary-art-arun91gj");
 await verifyAdmissionsNeonBranch({...env,CAN_ADMISSIONS_TEST_BRANCH_ID:env.CAN_PILOT_QA_BRANCH_ID});
 const specs=[["CAN_CANONICAL_AUTH_DATABASE_URL","can_os_canonical_auth_app"],["CAN_CANONICAL_OPERATIONS_DATABASE_URL","can_os_canonical_ops_app"]];
 const urls=new Set([env.TEST_DATABASE_URL]);
 for(const [key,role] of specs){
  const url=env[key];assert.ok(url&&!urls.has(url));urls.add(url);
  const parsed=new URL(url);assert.equal(parsed.username,role);
  assert.ok(parsed.password&&!["user","role","options"].some(k=>parsed.searchParams.has(k)));
  const sql=neon(url);
  const [r]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,
    session_user AS login,current_user AS active,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
    FROM pg_roles WHERE rolname=session_user`;
  assert.deepEqual(r,{project:"sweet-hall-62441909",branch:env.CAN_PILOT_QA_BRANCH_ID,login:role,active:role,rolcanlogin:true,rolinherit:false,rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false});
  const [acl]=await sql`SELECT
    has_table_privilege(current_user,'public.access_sessions','SELECT') AS sessions,
    has_table_privilege(current_user,'public.noncredit_self_enrollment_claims','SELECT') AS claims,
    has_table_privilege(current_user,'public.facilitated_room_attendance_assertions','SELECT') AS attendance,
    has_table_privilege(current_user,'public.facilitated_room_attendance_assertions','INSERT') AS write_attendance`;
  assert.deepEqual(acl,{sessions:false,claims:false,attendance:false,write_attendance:false});
  // A real SQL denial, not merely ACL inspection. LIMIT 0 returns no data.
  await assert.rejects(()=>sql`SELECT 1 FROM public.facilitated_room_attendance_assertions LIMIT 0`,e=>e?.code==="42501");
 }
 const owner=neon(env.TEST_DATABASE_URL);
 const rows=await owner`SELECT c.relname AS name,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN
   ('noncredit_self_enrollment_releases','noncredit_self_enrollment_claims','facilitated_room_attendance_assertions','facilitated_room_presence_events','facilitated_room_activity_responses')`;
 assert.equal(rows.length,5);assert.ok(rows.every(r=>r.enabled&&r.forced));
 console.log("PASS: two restricted login roles, raw access denial and five forced-RLS relations; tenant policy behavior remains separate.");
}catch{
 console.error("BLOCKED: restricted QA login, privilege or RLS preflight failed; no connection details printed.");
 process.exitCode=1;
}
