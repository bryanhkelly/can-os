import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Pool} from "@neondatabase/serverless";
import {verifyAdmissionsNeonBranch} from "../verify-admissions-neon-branch.mjs";

const env=process.env;
const branch=env.CAN_PILOT_QA_BRANCH_ID;
if(!branch||branch==="br-restless-sea-ar9ooo55"||branch==="br-bitter-feather-ar0u63x7")
 throw new Error("Dedicated nonproduction Pilot QA branch required");
await verifyAdmissionsNeonBranch({...env,CAN_ADMISSIONS_TEST_BRANCH_ID:branch});
const pool=new Pool({connectionString:env.TEST_DATABASE_URL,max:1});
let client;
try{
 client=await pool.connect();
 await client.query("BEGIN");
 await client.query("SELECT set_config('can.qa_expected_branch',$1,true)",[branch]);
 await client.query("CREATE TEMPORARY TABLE pilot_qa_result(result jsonb) ON COMMIT DROP");
 await client.query(readFileSync("database/canonical/v3.0.1/accept-noncredit-assessment-provisioning-qa.sql","utf8"));
 const {rows}=await client.query("SELECT result FROM pilot_qa_result");
 assert.deepEqual(rows.map(r=>r.result),[{
   assessment_grants:2,repeat_idempotent:true,ambiguous_final_denied:true,
   distinct_learner_grants:true,no_premature_completion:true,
   learner_and_policy_pinned:true,assessment_alone_not_completion:true,
   seven_lessons_required:true,automatic_completion_once:true,completion_audit_and_domain_event:true,
   baseline_no_feedback:true,final_feedback_exact_scope:true,feedback_invitation_idempotent:true,
   five_feedback_answers:true,duplicate_feedback_denied:true,
   restricted_go_exact_code:true,go_counter_two_opens:true,paused_go_denied:true,
   one_authoritative_person:true,wrong_site_claim_denied:true,attributed_claim_persisted:true,
   canonical_report_reconciled:true,
 }]);
 console.log("PASS: 22 canonical Go, enrollment, assessment, completion, feedback and evidence checks; synthetic fixture rolled back.");
}finally{
 if(client){try{await client.query("ROLLBACK");}finally{client.release();}}
 await pool.end();
}
