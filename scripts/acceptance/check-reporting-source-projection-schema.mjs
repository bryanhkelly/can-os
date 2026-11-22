#!/usr/bin/env node
/**
 * READ-ONLY migration 0100 acceptance check.
 *
 * CAN_REPORTING_PROJECTION_PREFLIGHT=1
 * CAN_EXPECTED_NEON_BRANCH_ID=br-...
 * DATABASE_URL=postgres://...
 * node scripts/acceptance/check-reporting-source-projection-schema.mjs
 *
 * No database is modified or migration applied. An application role with
 * BYPASSRLS remains a security exception requiring separate operational review.
 */
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

if (process.env.CAN_REPORTING_PROJECTION_PREFLIGHT !== "1") {
  throw new Error("Explicit read-only reporting schema preflight opt-in required");
}
if (!process.env.DATABASE_URL ||
    !/^br-[a-z0-9-]+$/.test(process.env.CAN_EXPECTED_NEON_BRANCH_ID ?? "")) {
  throw new Error("DATABASE_URL and exact expected Neon branch ID are required");
}
const query=neon(process.env.DATABASE_URL);
const [connection]=await query`
  SELECT current_setting('neon.project_id',true) AS project,
         current_setting('neon.branch_id',true) AS branch,
         current_database() AS database_name, current_user AS current_role
`;
assert.equal(connection?.project,"sweet-hall-62441909","Unexpected Neon project");
assert.equal(connection?.branch,process.env.CAN_EXPECTED_NEON_BRANCH_ID,
  "Refusing a different Neon branch");
assert.equal(connection?.database_name,"neondb","Unexpected database");

const [table]=await query`
  SELECT c.relrowsecurity AS rls_enabled,
         c.relforcerowsecurity AS rls_forced
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='reporting_source_event_receipts'
`;
assert.equal(table?.rls_enabled,true,"Reporting receipts RLS missing");
assert.equal(table?.rls_forced,true,"Reporting receipts forced RLS missing");
const indexes=await query`
  SELECT indexname FROM pg_indexes
  WHERE schemaname='public' AND tablename='reporting_source_event_receipts'
`;
const names=new Set(indexes.map(row=>row.indexname));
for (const name of [
  "reporting_source_event_receipts_pkey",
  "reporting_source_canonical_revision_uq",
  "reporting_source_site_period_idx",
  "reporting_source_program_period_idx",
  "reporting_source_correction_idx",
  "reporting_source_retry_idx",
]) assert(names.has(name),"Required reporting projection index missing: "+name);

const [meta]=await query`
  SELECT (SELECT count(*)::int FROM public.reporting_source_event_receipts) AS receipts,
         (SELECT count(*)::int FROM public.reporting_source_event_receipts
            WHERE status='accepted') AS accepted,
         (SELECT count(*)::int FROM public.reporting_source_event_receipts
            WHERE status='legacy') AS legacy,
         (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls
`;
console.log(JSON.stringify({
  project:connection.project,branch:connection.branch,role:connection.current_role,
  migration:"0100_reporting_source_event_receipts",indexes:[...names].sort(),
  receiptCounts:{total:meta.receipts,accepted:meta.accepted,legacy:meta.legacy},
  ownerBypassesRls:meta.bypass_rls,
  schemaReady:true,
  reminder:"A passing read-only schema check is not a role-isolation or rollout certification",
},null,2));
