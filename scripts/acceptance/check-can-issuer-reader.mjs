#!/usr/bin/env node
/**
 * Read-only release gate for CAN's one-login credential issuer reader.
 * Neither DATABASE_URL nor a privileged owner connection is accepted.
 *
 * CAN_CANONICAL_AUTH_DATABASE_URL=... npm run db:canonical:issuer-reader
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

const connectionString=process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
const appConnection=process.env.DATABASE_URL;
if (!connectionString) throw new Error("Restricted canonical auth URL is required");
if (appConnection && connectionString===appConnection)
  throw new Error("The restricted auth URL cannot be the general DATABASE_URL");

const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:3000});
const client=await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  const identity=await client.query("SELECT session_user AS login");
  assert.equal(identity.rows[0]?.login,"can_os_canonical_auth_app",
    "The auth reader must use the dedicated nonowner database login");
  await client.query("SET LOCAL ROLE can_v30_canonical_auth_reader");
  const result=await client.query(`
    SELECT current_user AS role,
      has_schema_privilege(current_user,'education_v30','USAGE') AS can_use_schema,
      has_function_privilege(current_user,
        'education_v30.v301_can_staff_session_context(text)','EXECUTE') AS staff_auth_available,
      has_function_privilege(current_user,
        'education_v30.v301_can_sensitive_capability(text,text)','EXECUTE') AS issuer_auth_available,
      has_table_privilege(current_user,
        'public.access_sessions','SELECT') AS can_read_raw_sessions,
      has_table_privilege(current_user,
        'public.access_account_canonical_principals','SELECT') AS can_read_identity_links,
      has_table_privilege(current_user,
        'education_v30.canonical_account_grants','SELECT') AS can_read_native_grants,
      has_table_privilege(current_user,
        'education_v30.canonical_sensitive_capability_approvals','SELECT') AS can_read_approvals,
      education_v30.v301_can_sensitive_capability(repeat('0',64),'credential.issue') AS unknown_issuer,
      education_v30.v301_can_sensitive_capability(repeat('0',64),'blueprint.review') AS unknown_other_capability
  `);
  const row=result.rows[0]??{};
  assert.equal(row.role,"can_v30_canonical_auth_reader");
  assert.equal(row.can_use_schema,true);
  assert.equal(row.staff_auth_available,true);
  assert.equal(row.issuer_auth_available,true);
  for(const key of ["can_read_raw_sessions","can_read_identity_links",
    "can_read_native_grants","can_read_approvals",
    "unknown_issuer","unknown_other_capability"]){
    assert.equal(row[key],false, `Restricted reader must not allow ${key}`);
  }
  // Check the installed function, not just source files: a previously
  // installed version lacking the account binding MUST fail this gate.
  const [functionRow]= (await client.query(`
    SELECT pg_get_functiondef('education_v30.v301_can_sensitive_capability(text,text)'::regprocedure) AS body
  `)).rows;
  const body=String(functionRow?.body??"").replaceAll(/\s+/g,"").toLowerCase();
  assert(body.includes(
    "approval.requested_by_can_account_id=source_session.account_id"),
    "Issuer authority must be bound to the actual signed-in CAN account"
  );
  assert(body.includes("source_session.secret_hash=p_can_session_hash"),
    "Source CAN account must be resolved from the exact hashed session");
  await client.query("ROLLBACK");
  const [restored]=(await client.query("SELECT current_user AS role")).rows;
  assert.equal(restored?.role,"can_os_canonical_auth_app",
    "Restricted role must not leak into subsequent pooled requests");
  console.log("PASS: one-login credential reader is account-bound, nonowner, and least privileged.");
} catch (error){
  try {await client.query("ROLLBACK")} catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
