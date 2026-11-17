#!/usr/bin/env node
/** Isolated, rollback-only DB acceptance for the one-Person account invariant.
 * This uses synthetic identities and always ROLLBACKs. It requires a QA URL,
 * an explicit opt-in and the additive Person-anchor migration.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "@neondatabase/serverless";

if(process.env.CAN_IDENTITY_CUTOVER_QA!=="1")
  throw new Error("Explicit CAN_IDENTITY_CUTOVER_QA=1 required");
const url=process.env.CAN_IDENTITY_QA_DATABASE_URL;
if(!url || url===process.env.DATABASE_URL)
  throw new Error("Use a distinct isolated QA database, never DATABASE_URL");

const pool=new Pool({connectionString:url,max:1});
const client=await pool.connect();
let begun=false;
async function mustDeny(sql,params,code){
  await client.query("SAVEPOINT one_person_negative");
  let rejected=false;
  try{
    await client.query(sql,params);
  }catch(error){
    if(error.code!==code)throw error;
    rejected=true;
  }finally{
    await client.query("ROLLBACK TO SAVEPOINT one_person_negative");
    await client.query("RELEASE SAVEPOINT one_person_negative");
  }
  assert.equal(rejected,true,"Expected SQLSTATE "+code+" but write succeeded");
}
try{
  await client.query("BEGIN");begun=true;
  const target=await client.query(
    "SELECT current_setting('neon.project_id',true) AS project_id, "+
    "current_setting('neon.branch_id',true) AS branch_id",
  );
  assert.equal(target.rows[0]?.project_id,"sweet-hall-62441909",
    "Identity constraint acceptance must target the CAN OS project");
  assert.equal(target.rows[0]?.branch_id,"br-bitter-feather-ar0u63x7",
    "Synthetic identity acceptance is permitted only on test01");
  const personA=randomUUID(),personB=randomUUID();
  const accountA=randomUUID(),accountB=randomUUID();
  const accountMailA="can-person-qa-"+accountA+"@example.invalid";
  const accountMailB="can-person-qa-"+accountB+"@example.invalid";
  await client.query(
    "INSERT INTO public.people(id,legal_first_name,legal_last_name) VALUES ($1,'QA','Person'),($2,'QA','Other')",
    [personA,personB],
  );
  await client.query(
    "INSERT INTO public.access_accounts(id,email_normalized) VALUES ($1,$3),($2,$4)",
    [accountA,accountB,accountMailA,accountMailB],
  );
  const firstGrantId=randomUUID();
  await client.query(
    "INSERT INTO public.account_person_grants(id,account_id,person_id,role,active) VALUES ($1,$2,$3,'account_holder',true)",
    [firstGrantId,accountA,personA],
  );
  const anchored=await client.query(
    "SELECT person_id FROM public.access_accounts WHERE id=$1",[accountA]);
  assert.equal(anchored.rows[0]?.person_id,personA,
    "First authorized grant must anchor immutable account Person");

  // Additional roles for the SAME Person are permitted.
  await client.query(
    "INSERT INTO public.account_person_grants(id,account_id,person_id,role,active) VALUES ($1,$2,$3,'guardian',true)",
    [randomUUID(),accountA,personA],
  );
  await mustDeny(
    "INSERT INTO public.account_person_grants(id,account_id,person_id,role,active) VALUES ($1,$2,$3,'student',true)",
    [randomUUID(),accountA,personB],"23514",
  );
  await mustDeny(
    "UPDATE public.access_accounts SET person_id=$1 WHERE id=$2",
    [personB,accountA],"23514",
  );
  await mustDeny(
    "UPDATE public.access_accounts SET person_id=$1 WHERE id=$2",
    [null,accountA],"23514",
  );
  await mustDeny(
    "UPDATE public.account_person_grants SET person_id=$1 WHERE id=$2",
    [personB,firstGrantId],"23514",
  );
  await mustDeny(
    "UPDATE public.account_person_grants SET account_id=$1 WHERE id=$2",
    [accountB,firstGrantId],"23514",
  );
  await mustDeny(
    "UPDATE public.access_accounts SET person_id=$1 WHERE id=$2",
    [personA,accountB],"23505",
  );
  console.log("PASS: one CAN Person, multiple roles, immutable ownership and account uniqueness");
}finally{
  if(begun){try{await client.query("ROLLBACK");}catch{}}
  client.release();
  await pool.end();
}
