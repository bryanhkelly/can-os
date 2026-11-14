#!/usr/bin/env node
/**
 * Read-only, two-learner noncredit security acceptance.
 * Never uses schema-owner credentials or synthetic application-side filters.
 * Requires two separately restricted database logins with preprovisioned
 * course/registration fixtures on the SAME isolated database.
 *
 * APP_ENV=test
 * TEST_DATABASE_URL=...
 * CAN_NONCREDIT_LEARNER_A_DATABASE_URL=...
 * CAN_NONCREDIT_LEARNER_B_DATABASE_URL=...
 * CAN_NONCREDIT_LEARNER_A_ATTEMPT_ID=...
 * CAN_NONCREDIT_LEARNER_B_ATTEMPT_ID=...
 * CAN_NONCREDIT_LEARNER_A_REGISTRATION_ID=...
 * CAN_NONCREDIT_LEARNER_B_REGISTRATION_ID=...
 */
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { endpoint } from "../isolated-test-db-guard.mjs";
if(existsSync(".env.local"))loadEnvFile(".env.local");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=m=>{throw new Error("Noncredit learner isolation failed: "+m)};
const required=k=>{const v=process.env[k];if(!v)fail("Missing "+k);return v;};
async function run(){
  if(process.env.APP_ENV!=="test"||process.env.NODE_ENV==="production")
    fail("APP_ENV=test and nonproduction runtime are required");
  const test=required("TEST_DATABASE_URL");
  const testHost=endpoint(test,fail);
  if(process.env.DATABASE_URL&&testHost===endpoint(process.env.DATABASE_URL,fail))
    fail("TEST_DATABASE_URL must differ from application database");
  const urls=["A","B"].map(k=>required("CAN_NONCREDIT_LEARNER_"+k+"_DATABASE_URL"));
  const attempts=["A","B"].map(k=>required("CAN_NONCREDIT_LEARNER_"+k+"_ATTEMPT_ID"));
  const registrations=["A","B"].map(k=>required("CAN_NONCREDIT_LEARNER_"+k+"_REGISTRATION_ID"));
  if([...attempts,...registrations].some(x=>!uuid.test(x))||
     attempts[0]===attempts[1]||registrations[0]===registrations[1])
    fail("Two distinct valid course attempts and registrations required");
  for(const url of urls){
    const user=new URL(url),owner=new URL(test);
    if(endpoint(url,fail)!==testHost||user.pathname!==owner.pathname||
       user.username===owner.username)
      fail("Each learner must have a distinct non-owner login to the isolated database");
  }
  const pools=urls.map(connectionString=>new Pool({connectionString,max:1}));
  const clients=[];
  try{
    for(const pool of pools){
      const client=await pool.connect();clients.push(client);
      await client.query("BEGIN TRANSACTION READ ONLY");
    }
    const principals=[];
    for(const client of clients){
      const {rows}=await client.query(`
        SELECT session_user AS principal, r.rolsuper,r.rolbypassrls,r.rolcanlogin,
          pg_has_role(r.oid,(SELECT nspowner FROM pg_namespace
              WHERE nspname='education_v30'),'MEMBER') AS owner_member
        FROM pg_roles r WHERE r.rolname=session_user
      `);
      const r=rows[0];
      if(!r||!r.rolcanlogin||r.rolsuper||r.rolbypassrls||r.owner_member)
        fail("A restricted non-owner principal is required");
      principals.push(r.principal);
    }
    if(principals[0]===principals[1])fail("Two independent learner principals required");
    for(let i=0;i<2;i++){
      const client=clients[i],other=1-i;
      const {rows:courses}=await client.query(`
        SELECT id,noncredit_registration_id,section_id,enrollment_id
        FROM education_v30.learner_course_attempts WHERE id=ANY($1::uuid[])
      `,[[attempts[i],attempts[other]]]);
      if(courses.length!==1||courses[0].id!==attempts[i]||
         courses[0].noncredit_registration_id!==registrations[i]||
         courses[0].section_id||courses[0].enrollment_id)
        fail("Learner "+i+" could see another Course attempt or the wrong participation source");
      const {rows:regs}=await client.query(`
        SELECT id FROM education_v30.noncredit_registrations WHERE id=ANY($1::uuid[])
      `,[[registrations[i],registrations[other]]]);
      if(regs.length!==1||regs[0].id!==registrations[i])
        fail("Learner "+i+" could see another participant's registration");
      const {rows:grants}=await client.query(`
        SELECT course_attempt_id FROM education_v30.assessment_access_grants
        WHERE course_attempt_id=ANY($1::uuid[])
      `,[[attempts[i],attempts[other]]]);
      if(grants.some(g=>g.course_attempt_id!==attempts[i]))
        fail("Learner "+i+" could see another participant's assessment authorization");
      const {rows:progress}=await client.query(`
        SELECT course_attempt_id FROM education_v30.learner_lesson_progress
        WHERE course_attempt_id=ANY($1::uuid[])
      `,[[attempts[i],attempts[other]]]);
      if(progress.some(p=>p.course_attempt_id!==attempts[i]))
        fail("Learner "+i+" could see another participant's lesson history");
      console.log("PASS: learner "+(i+1)+" is restricted to their own noncredit Course, grant and progress");
    }
  }finally{
    for(const c of clients){await c.query("ROLLBACK").catch(()=>undefined);c.release();}
    await Promise.all(pools.map(p=>p.end()));
  }
}
run().catch(error=>{
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
});
