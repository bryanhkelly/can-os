#!/usr/bin/env node
/**
 * Read-only migration 0101 preflight. Refuses an unselected Neon branch.
 * This does not certify runtime role isolation or end-to-end reconciliation.
 */
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
if (process.env.CAN_REPORTING_SNAPSHOT_PREFLIGHT !== "1" ||
  !process.env.DATABASE_URL ||
  !/^br-[a-z0-9-]+$/.test(process.env.CAN_EXPECTED_NEON_BRANCH_ID ?? "")) {
  throw new Error("Explicit snapshot preflight, DATABASE_URL and Neon branch required");
}
const query=neon(process.env.DATABASE_URL);
const [connection]=await query`
 SELECT current_setting('neon.project_id',true) AS project,
  current_setting('neon.branch_id',true) AS branch,
  current_database() AS database
`;
assert.equal(connection?.project,"sweet-hall-62441909","Unexpected Neon project");
assert.equal(connection?.branch,process.env.CAN_EXPECTED_NEON_BRANCH_ID,"Wrong Neon branch");
assert.equal(connection?.database,"neondb","Unexpected Neon database");
const rows=await query`
 SELECT c.relname AS name,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN
 ('reporting_source_snapshots','reporting_source_snapshot_events')
`;
assert.equal(rows.length,2,"Missing one or both private snapshot tables");
for(const row of rows) {
 assert.equal(row.enabled,true,"Snapshot RLS disabled: "+row.name);
 assert.equal(row.forced,true,"Snapshot forced RLS disabled: "+row.name);
}
const indexes=await query`
 SELECT indexname FROM pg_indexes WHERE schemaname='public'
 AND tablename IN ('reporting_source_snapshots','reporting_source_snapshot_events')
`;
const names=new Set(indexes.map(row=>row.indexname));
for(const index of ["reporting_source_snapshots_pkey",
 "reporting_source_snapshot_events_pk",
 "reporting_snapshots_scope_time_idx","reporting_snapshot_events_source_idx"]) {
 assert(names.has(index),"Missing snapshot index: "+index);
}
const triggers=await query`
 SELECT tgname FROM pg_trigger
 WHERE tgrelid IN ('public.reporting_source_snapshots'::regclass,
  'public.reporting_source_snapshot_events'::regclass) AND NOT tgisinternal
`;
const triggerNames=new Set(triggers.map(row=>row.tgname));
for(const trigger of ["guard_reporting_source_snapshot_mutation",
 "guard_reporting_source_snapshot_membership_mutation"]) {
 assert(triggerNames.has(trigger),"Missing immutability trigger: "+trigger);
}
const [access]=await query`
 SELECT pg_has_role(current_user,'can_reporting_service','USAGE') AS service_member,
   (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user) AS bypass_rls,
   has_table_privilege(current_user,'public.reporting_source_snapshots',
     'SELECT,INSERT') AS snapshot_privileges,
   has_table_privilege(current_user,'public.reporting_source_snapshot_events',
     'SELECT,INSERT') AS membership_privileges
`;
assert.equal(access?.bypass_rls,false,
  "Runtime snapshot login must not bypass forced RLS");
assert.equal(access?.service_member,true,
  "Reviewed can_reporting_service membership is required before enabling snapshots");
assert.equal(access?.snapshot_privileges,true,
  "Runtime snapshot login lacks read/insert privileges");
assert.equal(access?.membership_privileges,true,
  "Runtime snapshot membership login lacks read/insert privileges");
console.log(JSON.stringify({
 project:connection.project,branch:connection.branch,
 snapshotTables:rows.map(row=>row.name),
 forcedRls:true,serviceRoleInherited:access.service_member,
 immutabilityTriggers:[...triggerNames],
 caveat:"Read-only schema preflight, not integration or authorization certification",
},null,2));
