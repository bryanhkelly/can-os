#!/usr/bin/env node
/**
 * Release-time, read-only CAN Person schema gate.
 *
 * Runs BEFORE Cloudflare bundling/deployment, against the actual deployment
 * DATABASE_URL. An app that reads access_accounts.person_id MUST NOT ship
 * until its schema, immutable account identity, and grant guards are present.
 *
 * A missing DB URL or mismatched Neon branch is a failure, not a skip.
 * This is a required release precondition, not an optional feature flag.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const projectId = "sweet-hall-62441909";
const productionBranchId = "br-restless-sea-ar9ooo55";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "BLOCKED: deployment DATABASE_URL is required for CAN identity schema acceptance.",
  );
}
const sql = neon(connectionString);
const [row] = await sql`
SELECT
  current_setting('neon.project_id',true) AS project_id,
  current_setting('neon.branch_id',true) AS branch_id,
  current_database() AS database_name,
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='access_accounts'
      AND column_name='person_id'
  ) AS has_person_anchor,
  (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND ((table_name IN ('organizations','people') AND column_name='domain') OR (table_name='school_setup_signups' AND column_name='organization_domain') OR (table_name='access_accounts' AND column_name='private_access_code_hash') OR (table_name='access_sessions' AND column_name='authentication_method'))) AS release_identity_columns,
  (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('organizations','people') AND column_name='domain' AND is_nullable='YES') AS nullable_domains,
  EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='access_accounts_person_id_uq'
      AND indexdef ILIKE '%UNIQUE INDEX%'
  ) AS has_unique_person_index,
  (SELECT count(*)::int FROM pg_trigger t
     JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='access_accounts'
     AND t.tgname='can_account_person_immutable'
     AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
  ) AS immutable_account_triggers,
  (SELECT count(*)::int FROM pg_trigger t
     JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='account_person_grants'
     AND t.tgname='can_account_grants_one_person_guard'
     AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
  ) AS single_person_grant_triggers
`;

assert.equal(row?.project_id,projectId,
  "BLOCKED: deployment database is not the CAN OS Neon project");
assert.equal(row?.branch_id,productionBranchId,
  "BLOCKED: deployment database is not CAN OS production main");
assert.equal(row?.database_name,"neondb",
  "BLOCKED: unexpected database name");
for(const [key,want] of [
  ["has_person_anchor",true],
  ["release_identity_columns",5],
  ["nullable_domains",2],
  ["has_unique_person_index",true],
  ["immutable_account_triggers",1],
  ["single_person_grant_triggers",1],
]) assert.equal(row?.[key],want,"BLOCKED: required CAN Person schema object missing: "+key);

// Check the restricted database reader, not merely the public column names.
const [reader] = await sql`
SELECT
  coalesce(pg_get_functiondef(to_regprocedure('education_v30.v301_can_staff_session_context(text)')) LIKE '%private_access_code_hash%',false) AS private_credential_reader,
  coalesce(pg_get_functiondef(to_regprocedure('education_v30.v301_can_staff_session_context(text)')) LIKE '%authentication_method%',false) AS provenance_reader,
  coalesce(pg_get_functiondef(to_regprocedure('education_v30.v301_can_staff_session_context(text)')) LIKE '%COALESCE(s.delegated_grant_id,s.active_grant_id)%',false) AS delegated_staff_reader,
  coalesce(pg_get_functiondef(to_regprocedure('education_v30.v301_can_staff_session_context(text)')) LIKE '%synthetic_scope.approved%',false) AS synthetic_scope_reader,
  coalesce(pg_get_functiondef(to_regprocedure('education_v30.v301_can_sensitive_capability(text,text)')) LIKE '%source_session.delegated_grant_id IS NULL%',false) AS independent_issuer_reader,
  (SELECT max(created_at) FROM drizzle.__drizzle_migrations) AS migration_tip
`;
assert.equal(reader?.private_credential_reader,true,"BLOCKED: restricted staff credential migration 0133 missing");
assert.equal(reader?.provenance_reader,true,"BLOCKED: restricted staff session provenance missing");
assert.equal(reader?.delegated_staff_reader,true,"BLOCKED: restricted staff delegation migration 0137 missing");
assert.equal(reader?.synthetic_scope_reader,true,"BLOCKED: approved synthetic staff scope missing");
assert.equal(reader?.independent_issuer_reader,true,"BLOCKED: independent issuer delegation exclusion missing");
const journal=JSON.parse(readFileSync(new URL("../../drizzle/meta/_journal.json",import.meta.url),"utf8"));
const required=journal.entries.filter(entry=>entry.idx>=133&&entry.idx<=137);
assert.equal(required.length,5,"BLOCKED: identity release migration journal incomplete");
assert.ok(Number(reader?.migration_tip)>=Number(required.at(-1).when),"BLOCKED: release migration ledger incomplete");
for(const entry of required){
  const hash=createHash("sha256").update(readFileSync(new URL("../../drizzle/"+entry.tag+".sql",import.meta.url))).digest("hex");
  const records=await sql`SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=${entry.when}`;
  assert.equal(records.length,1,"BLOCKED: missing or duplicate release migration "+entry.tag);
  assert.equal(records[0].hash,hash,"BLOCKED: applied migration differs from source "+entry.tag);
}

// Do not even reference the new column until its existence is confirmed;
// on an unmigrated deployment, the preceding checks fail with a clear reason.
const [integrity] = await sql`
SELECT
  (SELECT count(*)::int
   FROM public.account_person_grants g
   JOIN public.access_accounts a ON a.id=g.account_id
   WHERE g.active AND (a.person_id IS NULL OR a.person_id<>g.person_id)
  ) AS mismatched_active_grants,
  (SELECT count(*)::int
   FROM public.access_accounts a
   WHERE a.person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.people p WHERE p.id=a.person_id
   )
  ) AS missing_people,
  (SELECT count(*)::int
   FROM public.access_accounts a
   WHERE a.person_id IS NULL AND EXISTS (
     SELECT 1 FROM public.account_person_grants g
     WHERE g.account_id=a.id
   )
  ) AS unanchored_historical_accounts
`;
assert.equal(integrity?.unanchored_historical_accounts,0,
  "BLOCKED: historical CAN accounts lack an authoritative Person; migration 0085 required");
assert.equal(integrity?.mismatched_active_grants,0,
  "BLOCKED: active CAN grant Person differs from account anchor");
assert.equal(integrity?.missing_people,0,
  "BLOCKED: CAN account references a missing Person");

console.log(JSON.stringify({
  result:"PASS",
  target:"Neon can-os production main",
  identity:"one immutable CAN Person",
  note:"Required schema preflight passed; not a build, E2E, RLS or canonical-v3 data cutover.",
}));
