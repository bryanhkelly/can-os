// QA ONLY: seal the existing synthetic draft questions with the actual isolated
// runtime's key, using the production AES-GCM helper. No publication or reviews.
import assert from "node:assert/strict";
import {Pool} from "@neondatabase/serverless";
import {sealNoncreditAnswerKey,openNoncreditAnswerKey,NONCREDIT_KEY_REF} from "../../src/domain/noncredit-knowledge-check";
import {verifyAdmissionsNeonBranch} from "../verify-admissions-neon-branch.mjs";
const branch="br-spring-frog-arnmih9w";
const env=process.env;
const key=env.CAN_NONCREDIT_ASSESSMENT_KEY_HEX??"";
assert.equal(env.CAN_PILOT_QA_BRANCH_ID,branch);
assert.equal(env.CAN_TEST_DB_WRITES_ENABLED,"true");
assert.match(key,/^[a-f0-9]{64}$/i);
await verifyAdmissionsNeonBranch({...env,CAN_ADMISSIONS_TEST_BRANCH_ID:branch});
const expected=[
 ["What should you do before collecting information?","Define the decision"],
 ["Which evidence helps choose a meeting time?","Participants’ availability"],
 ["What should you do when important information is missing?","Identify the gap and seek evidence"],
 ["How should you compare realistic options?","Use consistent criteria"],
 ["Which best measures actual participation?","Verified participation records"],
] as const;
const pool=new Pool({connectionString:env.TEST_DATABASE_URL,max:1});
const client=await pool.connect();
try{
 await client.query("BEGIN");
 const {rows:[target]}=await client.query("SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch");
 assert.equal(target.project,"sweet-hall-62441909");assert.equal(target.branch,branch);
 const {rows}=await client.query(`
 SELECT v.id,v.item_prompt,i.item_key
 FROM public.assessment_item_versions v
 JOIN public.assessment_items i ON i.id=v.item_id
 JOIN public.assessment_item_banks b ON b.id=i.bank_id
 JOIN public.organizations o ON o.id=b.owner_organization_id
 WHERE o.metadata->>'qa_only'='true' AND o.metadata->>'qa_fixture_key'='pilot1-api-rehearsal-v1'
 AND o.metadata->>'intended_branch'=$1 AND v.lifecycle='draft' AND v.response_kind='single_select'
 ORDER BY i.item_key FOR UPDATE OF v
 `,[branch]);
 assert.equal(rows.length,expected.length,"Expected exactly five shared QA draft questions");
 for(const [index,row] of rows.entries()){
   const [prompt,answer]=expected[index]!;
   assert.equal(row.item_key,"qa-item-"+(index+1));
   assert.equal(row.item_prompt.text,prompt);
   const {rows:options}=await client.query("SELECT id,display_content FROM public.assessment_item_options WHERE item_version_id=$1 ORDER BY ordinal",[row.id]);
   assert.equal(options.length,3);
   const correct=options.filter(o=>o.display_content.text===answer);
   assert.equal(correct.length,1);
   const {rows:existing}=await client.query("SELECT encrypted_key,encryption_key_ref FROM public.assessment_item_secure_keys WHERE item_version_id=$1",[row.id]);
   if(existing.length){
     assert.equal(existing.length,1);assert.equal(existing[0].encryption_key_ref,NONCREDIT_KEY_REF);
     assert.deepEqual(openNoncreditAnswerKey(key,row.id,existing[0].encrypted_key),[correct[0].id]);
   }else{
     const sealed=sealNoncreditAnswerKey(key,row.id,[correct[0].id]);
     assert.deepEqual(openNoncreditAnswerKey(key,row.id,sealed),[correct[0].id]);
     await client.query("INSERT INTO public.assessment_item_secure_keys(item_version_id,encrypted_key,encryption_key_ref) VALUES($1,$2,$3)",[row.id,sealed,NONCREDIT_KEY_REF]);
   }
 }
 await client.query("COMMIT");
 console.log("Five synthetic draft answer keys verified. Publication and independent review remain separate.");
}catch(error){await client.query("ROLLBACK");throw error;}
finally{client.release();await pool.end();}
