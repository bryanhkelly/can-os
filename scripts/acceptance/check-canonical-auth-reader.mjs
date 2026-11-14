#!/usr/bin/env node
/**
 * Read-only canonical login acceptance. Requires the dedicated, restricted
 * auth connection. Does not use DATABASE_URL or read raw account tables.
 *
 * CAN_CANONICAL_AUTH_DATABASE_URL=... npm run db:canonical:auth-reader
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

const url=process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
if(!url)throw new Error("CAN_CANONICAL_AUTH_DATABASE_URL is required");
const loginRole="can_os_canonical_auth_app";
const readerRole="can_v30_canonical_auth_reader";
const pool=new Pool({connectionString:url,max:1});
const client=await pool.connect();
try{
  await client.query("BEGIN READ ONLY");
  const before=await client.query("SELECT session_user AS login_role");
  assert.equal(before.rows[0]?.login_role,loginRole,
    "Auth URL must use the dedicated restricted login (not the DB owner)");
  await client.query("SET LOCAL ROLE "+readerRole);
  const result=await client.query(`
    SELECT current_user AS reader_role, session_user AS login_role,
      has_schema_privilege(current_user,'education_v30','USAGE') AS schema_access,
      has_function_privilege(current_user,
        'education_v30.v301_canonical_session_context(text)','EXECUTE') AS function_access,
      has_table_privilege(current_user,
        'education_v30.canonical_accounts','SELECT') AS can_read_accounts,
      has_table_privilege(current_user,
        'education_v30.canonical_account_grants','SELECT') AS can_read_grants,
      has_table_privilege(current_user,
        'education_v30.canonical_sessions','SELECT') AS can_read_sessions,
      has_table_privilege(current_user,
        'education_v30.learning_sessions','SELECT') AS can_read_activity,
      (SELECT count(*)::int FROM education_v30.v301_canonical_session_context(
        repeat('0',64))) AS invalid_sessions
  `);
  const row=result.rows[0]??{};
  assert.equal(row.reader_role,readerRole);
  assert.equal(row.login_role,loginRole);
  assert.equal(row.schema_access,true);
  assert.equal(row.function_access,true);
  for(const k of ["can_read_accounts","can_read_grants","can_read_sessions","can_read_activity"]){
    assert.equal(row[k],false,`Restricted login must not read raw data (${k})`);
  }
  assert.equal(row.invalid_sessions,0,"Unrecognized native session must not authenticate");
  await client.query("ROLLBACK");
  const after=await client.query("SELECT current_user AS restored");
  assert.equal(after.rows[0]?.restored,loginRole,
    "Transaction-scoped reader role must not leak into the connection pool");
  console.log("Canonical auth reader: valid least-privilege deployment configuration.");
}catch(error){
  try{await client.query("ROLLBACK")}catch{}
  throw error;
}finally{
  client.release();
  await pool.end();
}
