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
  ["has_unique_person_index",true],
  ["immutable_account_triggers",1],
  ["single_person_grant_triggers",1],
]) assert.equal(row?.[key],want,"BLOCKED: required CAN Person schema object missing: "+key);

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
  ) AS missing_people
`;
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
