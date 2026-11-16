#!/usr/bin/env node
/** Read-only, test-branch-only migration acceptance; no DDL or test data writes. */
import assert from "node:assert/strict";
import {Pool} from "@neondatabase/serverless";

if(process.env.CAN_NETWORK_SCHEMA_VALIDATION!=="1" || process.env.APP_ENV!=="test")
  throw new Error("Explicit CAN_NETWORK_SCHEMA_VALIDATION=1 and APP_ENV=test required");
const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error("Set TEST_DATABASE_URL to an isolated nonproduction branch");
const pool=new Pool({connectionString:url,max:1});
const tables=["network_units","network_memberships","network_member_identifiers",
  "network_reporting_grants","participation_attributions"];
try{
  const [catalog,siteColumns,triggers,policies]=await Promise.all([
    pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        WHERE a.grantee=0) AS grants_public
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='education_v30' AND c.relname=ANY($1::text[])`,[tables]),
    pool.query(`SELECT table_name,column_name,is_nullable FROM information_schema.columns
      WHERE table_schema='education_v30'
        AND table_name IN ('noncredit_self_enrollment_releases','noncredit_self_enrollment_claims')
        AND column_name='site_id'`),
    pool.query(`SELECT c.relname,t.tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='education_v30' AND NOT t.tgisinternal
      AND t.tgname IN ('network_unit_parent_guard','network_membership_path_guard',
        'participation_attribution_scope_guard','participation_attribution_history_guard',
        'network_member_identifier_guard','v301_noncredit_attribution_required',
        'v301_class_attribution_required')`),
    pool.query(`SELECT tablename,policyname FROM pg_policies
      WHERE schemaname='education_v30' AND tablename=ANY($1::text[])`,[tables]),
  ]);
  assert.equal(catalog.rows.length,tables.length,"Network tables missing");
  for(const row of catalog.rows){
    assert.equal(row.relrowsecurity,true,"RLS disabled "+row.relname);
    assert.equal(row.relforcerowsecurity,true,"Forced RLS disabled "+row.relname);
    assert.equal(row.grants_public,false,"Public read grants forbidden "+row.relname);
    assert(policies.rows.some(p=>p.tablename===row.relname &&
      p.policyname==="v301_network_trusted_owner_access"),
      "Missing trusted-owner policy "+row.relname);
  }
  assert.equal(siteColumns.rows.length,2,"Both noncredit release and claim Site columns required");
  assert(siteColumns.rows.every(r=>r.is_nullable==="NO"),"A release/claim Site must be NOT NULL");
  assert.equal(triggers.rows.length,7,"Required authorization and history triggers missing");
  const [{rows:checks},{rows:counts}]=await Promise.all([
    pool.query(`SELECT conname,contype FROM pg_constraint
      WHERE connamespace='education_v30'::regnamespace
      AND conname IN ('network_membership_unit_fk','network_units_parent_fk',
        'participation_attribution_source_ck','participation_attribution_membership_ck',
        'native_class_active_site_ck','network_member_external_id_verified_ck')`),
    pool.query(`SELECT
      (SELECT count(*) FROM education_v30.noncredit_self_enrollment_releases WHERE site_id IS NULL)
        AS null_releases,
      (SELECT count(*) FROM education_v30.noncredit_self_enrollment_claims WHERE site_id IS NULL)
        AS null_claims`),
  ]);
  assert.equal(checks.length,6,"Required ownership and source constraints missing");
  assert.equal(Number(counts[0].null_releases),0,"Site-less releases must be reconciled");
  assert.equal(Number(counts[0].null_claims),0,"Site-less claims must be reconciled");
  console.log("Verified network attribution structure, RLS, Site requirements and immutability guards");
}finally{await pool.end();}
