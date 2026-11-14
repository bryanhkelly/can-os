#!/usr/bin/env node
/** Read-only exact-branch acceptance check. Never creates, edits or deletes records. */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";
if (process.env.CAN_NONCREDIT_SCHEMA_VALIDATION !== "1")
  throw new Error("Set CAN_NONCREDIT_SCHEMA_VALIDATION=1 and an explicit database URL.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try {
  const [columns,functions,triggers,completionBody]=await Promise.all([
    pool.query(`
      SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='education_v30' AND (
        (table_name='noncredit_registrations' AND column_name='completion_policy_id') OR
        (table_name='noncredit_completion_policies' AND column_name IN ('completion_mode','require_all_lessons')) OR
        (table_name='noncredit_completion_decisions' AND column_name='decision_source') OR
        (table_name='noncredit_training_versions' AND column_name='baseline_assessment_version_id')
      )
    `),
    pool.query(`
      SELECT proname, NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
      ) AS not_public
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='education_v30'
      AND proname IN ('v301_try_auto_complete_noncredit','v301_lock_noncredit_completion_policy',
        'v301_provision_noncredit_knowledge_access')
    `),
    pool.query(`
      SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='education_v30' AND NOT t.tgisinternal
        AND tgname IN ('v301_noncredit_auto_on_participation','v301_noncredit_auto_on_lesson',
          'v301_noncredit_auto_on_assessment','v301_noncredit_auto_on_course',
          'v301_noncredit_auto_on_evidence','noncredit_registration_policy_pin')
    `),
    pool.query(`
      SELECT pg_get_functiondef('education_v30.v28_validate_completion()'::regprocedure)
        AS validation, pg_get_functiondef(
          'education_v30.v301_try_auto_complete_noncredit(uuid)'::regprocedure) AS automation
    `),
  ]);
  assert.equal(columns.rows.length,5,"Noncredit policy, provenance and baseline columns missing");
  assert.equal(functions.rows.length,3,"Noncredit policy/automatic/assessment functions missing");
  const automation=functions.rows.find(row=>row.proname==='v301_try_auto_complete_noncredit');
  assert(automation?.not_public===true,"Automatic completion must not be PUBLIC executable");
  assert.equal(triggers.rows.length,6,"Noncredit policy and five automation triggers missing");
  const code=completionBody.rows[0];
  assert(code?.validation?.includes('completion_policy_id'),
    "Completion validation must use enrollment-time policy");
  assert(code?.validation?.includes('verified_at'),
    "Completion validation must require verified participation");
  assert(code?.automation?.includes("completion_mode"),
    "Automatic completion must require an explicit provider-approved mode");
  console.log("CAN OS noncredit migration contract verified, read-only.");
} finally {
  await pool.end();
}
