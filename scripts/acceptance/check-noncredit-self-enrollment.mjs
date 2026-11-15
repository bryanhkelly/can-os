#!/usr/bin/env node
/**
 * Read-only, fail-closed acceptance gate for the additive native v3.0.1
 * self-enrollment schema. No data is created and production cannot be targeted.
 *
 * APP_ENV=test TEST_DATABASE_URL=<isolated test01 URL> node scripts/acceptance/check-noncredit-self-enrollment.mjs
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { endpoint } from "../isolated-test-db-guard.mjs";

if (existsSync(".env.local")) loadEnvFile(".env.local");
const fail=message=>{throw new Error("Self-enrollment acceptance refused: "+message);};
if(process.env.APP_ENV!=="test"||process.env.NODE_ENV==="production")
  fail("APP_ENV=test and a non-production process are required");
const url=process.env.TEST_DATABASE_URL;
if(!url)fail("TEST_DATABASE_URL must be an isolated acceptance database");
const target=endpoint(url,fail);
if(process.env.DATABASE_URL&&target===endpoint(process.env.DATABASE_URL,fail))
  fail("Test database must not be the application database");
if(process.env.CAN_APPLICATION_DB_HOST &&
  target===process.env.CAN_APPLICATION_DB_HOST.replace(/-pooler(?=\.)/,""))
  fail("Test database must differ from the application host");

const pool=new Pool({connectionString:url,max:1});
const client=await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  const {rows:tables}=await client.query(`
    SELECT n.nspname AS schema_name,c.relname AS table_name,
      c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
      has_table_privilege('can_os_canonical_auth_app',c.oid,'SELECT') AS canonical_reader_can_select
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='public' AND c.relname='access_account_noncredit_principals')
       OR (n.nspname='education_v30' AND c.relname IN (
        'noncredit_self_enrollment_releases','noncredit_self_enrollment_claims'))
  `);
  const found=new Map(tables.map(row=>[row.schema_name+"."+row.table_name,row]));
  for(const table of [
    "public.access_account_noncredit_principals",
    "education_v30.noncredit_self_enrollment_releases",
    "education_v30.noncredit_self_enrollment_claims",
  ]) {
    const row=found.get(table);
    assert.ok(row,"Missing "+table);
    assert.equal(row.rls_enabled,true,table+" must enable RLS");
    assert.equal(row.rls_forced,true,table+" must FORCE RLS");
    assert.equal(row.canonical_reader_can_select,false,
      "Restricted canonical auth login must never SELECT "+table);
  }
  const {rows:triggers}=await client.query(`
    SELECT t.tgname FROM pg_trigger t
    WHERE t.tgrelid IN (
      'education_v30.noncredit_self_enrollment_releases'::regclass,
      'education_v30.noncredit_self_enrollment_claims'::regclass)
      AND NOT t.tgisinternal
  `);
  assert.ok(triggers.some(row=>row.tgname==="v301_freeze_noncredit_release"),
    "Published release must be immutable");
  for(const trigger of ["v301_freeze_noncredit_claim",
    "v301_validate_noncredit_self_enrollment_claim"]) {
    assert.ok(triggers.some(row=>row.tgname===trigger),
      "Consent claim must enforce validation and immutable evidence: "+trigger);
  }
  const {rows:constraints}=await client.query(`
    SELECT c.conrelid::regclass::text AS table_name,c.conname,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.conrelid IN (
      'education_v30.noncredit_self_enrollment_releases'::regclass,
      'education_v30.noncredit_self_enrollment_claims'::regclass,
      'public.access_account_noncredit_principals'::regclass)
  `);
  const defs=constraints.map(row=>row.definition).join("\n");
  for(const fragment of [
    "UNIQUE (release_id, participant_person_id)",
    "UNIQUE (registration_id)", "CHECK (adult_attested)",
    "FOREIGN KEY (registration_id, participant_person_id)",
    "FOREIGN KEY (adoption_id, deployment_id, offering_version_id)",
    "FOREIGN KEY (training_version_id, offering_version_id)",
    "FOREIGN KEY (offering_version_id, course_version_id)",
    "CHECK ((opens_at < closes_at))",
  ]) assert.ok(defs.includes(fragment),"Missing release/claim constraint: "+fragment);
  const {rows:security}=await client.query(`
    SELECT proname, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30' AND proname IN
      ('v301_validate_noncredit_self_enrollment_claim',
       'v301_freeze_noncredit_enrollment_claim',
       'v301_freeze_noncredit_enrollment_release')
  `);
  assert.equal(security.length,3,"All three consent/release guard functions must exist");
  const validator=security.find(row=>row.proname==='v301_validate_noncredit_self_enrollment_claim')?.definition ?? "";
  for(const fragment of ["public.digest", "consent_sha256", "participant_person_id",
    "registration_row.adoption_id", "registering_organization_id"]) {
    assert.ok(validator.includes(fragment),"Missing current consent/lineage guard: "+fragment);
  }
  await client.query("ROLLBACK");
  console.log("Noncredit self-enrollment: schema, consent lineage/hash, FORCE RLS and restricted auth verified.");
} catch(error) {
  try{await client.query("ROLLBACK");}catch{}
  throw error;
} finally{
  client.release();
  await pool.end();
}
