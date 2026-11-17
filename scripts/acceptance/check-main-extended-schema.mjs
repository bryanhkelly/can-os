#!/usr/bin/env node
/**
 * CAN OS production/test schema parity acceptance for issuer + WS3/WS4/WS5.
 * Read-only: no migrations, data mutations, fake approvals, role grants or
 * credential issuance. Always bind to a declared Neon branch ID.
 *
 * CAN_MAIN_SCHEMA_CHECK=1 CAN_EXPECTED_NEON_BRANCH_ID=br-... \
 *   DATABASE_URL=... npm run db:canonical:main-schema
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

if (process.env.CAN_MAIN_SCHEMA_CHECK !== "1" ||
    !/^br-[a-z0-9-]+$/.test(process.env.CAN_EXPECTED_NEON_BRANCH_ID ?? "") ||
    !process.env.DATABASE_URL)
  throw new Error("Set CAN_MAIN_SCHEMA_CHECK=1, exact CAN_EXPECTED_NEON_BRANCH_ID and DATABASE_URL");

const names = [
  "canonical_sensitive_capability_approvals",
  "learning_completion_evidence_bindings",
  "class_completion_policy_versions",
  "class_enrollment_completion_pins",
  "learning_completion_evidence_review_requests",
  "class_session_agenda_revisions",
  "publisher_rollout_plans",
  "publisher_rollout_decisions",
  "operator_rollout_applications",
  "operator_rollout_decisions",
  "operator_rollout_class_links",
];
const guards = [
  "ws3_completion_evidence_guard_trg",
  "ws3_class_completion_policy_guard_trg",
  "ws3_class_enrollment_completion_pin_trg",
  "ws3_class_completion_pin_guard_trg",
  "ws3_review_request_mutation_guard",
  "ws3_class_completion_decision_insert_guard",
  "canonical_class_session_agenda_guard_trg",
  "publisher_rollout_decision_immutable_trg",
  "operator_rollout_decision_immutable_trg",
  "publisher_rollout_identity_immutable_trg",
  "operator_rollout_identity_immutable_trg",
  "operator_rollout_class_link_guard_trg",
  "publisher_rollout_review_independence_trg",
  "operator_rollout_review_independence_trg",
];
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
let connection;
try {
  connection=await pool.connect();
  await connection.query("BEGIN TRANSACTION READ ONLY");
  const query=(sql,params=[])=>connection.query(sql,params);
  const {rows:[identity]}=await query(
    "SELECT current_setting('neon.branch_id',true) AS branch, current_setting('transaction_read_only') AS read_only");
  assert.equal(identity?.branch,process.env.CAN_EXPECTED_NEON_BRANCH_ID,
    "Wrong Neon branch: stop without accepting this schema");
  assert.equal(identity?.read_only,"on","Expected an immutable acceptance transaction");
  const relations=await query(`
    SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
      (SELECT count(*)::int FROM pg_policies p
        WHERE p.schemaname='education_v30' AND p.tablename=c.relname) AS policies,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))
        WHERE grantee=0 AND privilege_type='SELECT') AS public_select
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='education_v30' AND c.relkind IN ('r','p')
      AND c.relname=ANY($1::text[])
  `,[names]);
  assert.equal(relations.rows.length,names.length,"Not all source-defined secured tables exist");
  for(const row of relations.rows){
    assert(row.relrowsecurity && row.relforcerowsecurity,
      "Forced RLS missing on "+row.relname);
    assert(Number(row.policies)>0,"Missing authorization policy on "+row.relname);
    assert(!row.public_select,"Unexpected public read permission on "+row.relname);
  }
  const triggers=await query(`
    SELECT t.tgname FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='education_v30' AND NOT t.tgisinternal AND t.tgenabled='O'
      AND t.tgname=ANY($1::text[])
  `,[guards]);
  const got=new Set(triggers.rows.map(row=>row.tgname));
  for(const name of guards)assert(got.has(name),"Missing enabled guard trigger: "+name);
  const columns=await query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='education_v30' AND table_name='class_outcomes'
      AND column_name=ANY($1::text[])
  `,[["completion_policy_version_id","completion_evidence_version_id",
      "completion_decided_by_person_id","supersedes_outcome_id","completion_reason"]]);
  assert.equal(columns.rows.length,5,"Governed Class Outcome columns missing");
  const {rows:[unknown]}=await query(
    "SELECT education_v30.v301_ws3_class_completion_is_current($1::uuid) AS current",
    ["00000000-0000-4000-8000-000000000000"]);
  assert.equal(unknown?.current,false,"Unknown Class Outcome must not be current");
  const functions=await query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30'
      AND proname IN ('v301_can_sensitive_capability','v301_ws3_class_completion_is_current')
  `);
  assert.equal(functions.rows.length,2,"Credential/WS3 authorization functions missing");
  console.log("CAN OS extended schema read-only acceptance passed",{
    branch:identity.branch,relations:relations.rows.length,
    guards:got.size,outcomeColumns:columns.rows.length,
  });
  await connection.query("ROLLBACK");
} catch(error){
  if(connection)await connection.query("ROLLBACK").catch(()=>{});
  console.error("Extended schema acceptance FAILED:",
    error instanceof Error?error.message:"unknown");
  process.exitCode=1;
} finally {
  connection?.release();
  await pool.end();
}
