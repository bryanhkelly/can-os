#!/usr/bin/env node
/**
 * Read-only QA identity-cutover acceptance. Does not apply migrations,
 * create credentials, modify source rows or infer Person ownership from email.
 *
 * CAN_IDENTITY_CUTOVER_QA=1 CAN_IDENTITY_QA_DATABASE_URL=... \
 *   node scripts/acceptance/check-one-person-cutover.mjs
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Pool} from "@neondatabase/serverless";

if(process.env.CAN_IDENTITY_CUTOVER_QA!=="1")
  throw new Error("Explicit CAN_IDENTITY_CUTOVER_QA=1 required");
if(!process.env.CAN_IDENTITY_QA_DATABASE_URL)
  throw new Error("An isolated QA database URL is required");
const pool=new Pool({connectionString:process.env.CAN_IDENTITY_QA_DATABASE_URL,max:1});
const client=await pool.connect();
try{
  await client.query("BEGIN READ ONLY");
  const target=await client.query(
    "SELECT current_setting('neon.project_id',true) AS project_id, "+
    "current_setting('neon.branch_id',true) AS branch_id",
  );
  assert.equal(target.rows[0]?.project_id,"sweet-hall-62441909",
    "QA preflight must target the CAN OS Neon project");
  assert.equal(target.rows[0]?.branch_id,"br-bitter-feather-ar0u63x7",
    "QA preflight must target isolated test01, never production");
  const sql=readFileSync(
    new URL("../../database/canonical/v3.0.1/preflight-one-person-cutover.sql",import.meta.url),
    "utf8",
  );
  const result=await client.query(sql);
  assert.equal(result.rows.length,1,"Identity preflight must return exactly one aggregate");
  const row=result.rows[0];
  // Numeric evidence is never a Person identifier and contains no private PII.
  for(const name of ["public_people","canonical_people","shared_person_ids",
    "can_accounts","native_accounts","shared_account_ids",
    "conflicting_account_grants","public_person_fk_count",
    "canonical_person_fk_count"]) {
    assert(Number.isSafeInteger(Number(row[name])), "Invalid identity count: "+name);
  }
  console.log("Identity QA cutover preflight",row);
  assert.match(
    row.cutover_preflight_result,
    /^IDENTITY DATA PREREQUISITES MET/,
    "One-Person cutover remains blocked; source changes alone are not acceptance",
  );
  await client.query("ROLLBACK");
}catch(error){
  try{await client.query("ROLLBACK");}catch{}
  throw error;
}finally{
  client.release();
  await pool.end();
}
