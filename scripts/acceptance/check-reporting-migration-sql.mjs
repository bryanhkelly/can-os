#!/usr/bin/env node
/**
 * Dependency-free structural migration guard. It does not replace executing
 * migration SQL in an isolated PostgreSQL environment.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function statementsFor(path) {
  const sql = readFileSync(path, "utf8");
  return {sql,statements:sql.split(/^--> statement-breakpoint\s*$/m)
    .map(statement => statement.trim()).filter(Boolean)};
}
const receipt = statementsFor("drizzle/0100_reporting_source_event_receipts.sql");
const snapshots = statementsFor("drizzle/0101_reporting_source_private_snapshots.sql");
assert.equal(receipt.statements.length, 13, "Receipt migration statement count changed");
assert.equal(snapshots.statements.length, 13, "Snapshot migration statement count changed");
const create = receipt.statements[0];
assert(create.includes('CREATE TABLE "public"."reporting_source_event_receipts"'),
  "Receipt table creation missing");
assert(create.trimEnd().endsWith(");"), "Receipt CREATE TABLE unfinished");
for (const col of ["event_id","source_id","source_version","dedup_key",
  "payload_fingerprint","organization_id","site_id","program_id",
  "correction_of_event_id","attempts","next_attempt_at"]) {
  assert(create.includes('"'+col+'"'),"Receipt column missing: "+col);
}
for (const name of ["reporting_source_receipt_status_ck",
  "reporting_source_receipt_data_ck","reporting_source_receipt_identity_ck",
  "reporting_source_retry_state_ck"]) {
  assert.equal(create.split('"'+name+'"').length-1,1,
    "Receipt constraint missing or duplicated: "+name);
}
for (const name of ["reporting_source_canonical_revision_uq",
 "reporting_source_site_period_idx","reporting_source_program_period_idx",
 "reporting_source_correction_idx","reporting_source_retry_idx",
 "reporting_source_outbox_scope_period_idx"]) {
  assert.equal(receipt.statements.filter(s=>
    s.startsWith("CREATE") && s.includes('"'+name+'"')).length,1,
    "Receipt index missing or duplicated: "+name);
}
const sha256Pattern=String.fromCharCode(39)+"^[0-9a-f]{64}$"+String.fromCharCode(39);
assert(create.includes(sha256Pattern),"Receipt fingerprint constraint incomplete");
for(const name of ["reporting_source_snapshots","reporting_source_snapshot_events"]) {
  assert.equal(snapshots.statements.filter(s=>
    s.includes('CREATE TABLE "public"."' + name + '"')).length,1,
    "Snapshot CREATE TABLE missing or duplicated: "+name);
  assert.equal(snapshots.statements.filter(s=>
    s.includes('ALTER TABLE "public"."' + name + '" ENABLE ROW LEVEL SECURITY')).length,1);
  assert.equal(snapshots.statements.filter(s=>
    s.includes('ALTER TABLE "public"."' + name + '" FORCE ROW LEVEL SECURITY')).length,1);
}
assert(snapshots.sql.includes(sha256Pattern),"Snapshot digest constraint incomplete");
for(const name of ["guard_reporting_source_snapshot_mutation",
  "guard_reporting_source_snapshot_membership_mutation"]) {
  assert.equal(snapshots.statements.filter(s=>
    s.includes("CREATE TRIGGER "+name)).length,1,
    "Snapshot immutability trigger missing or duplicated: "+name);
}
assert.equal(receipt.statements.filter(s=>
  s.includes("CREATE TRIGGER guard_reporting_source_receipt_mutation")).length,1);
const normalized=create.replace(/'([^']|'')*'/g,"''").replace(/--[^\n]*/g,"");
let depth=0;
for(const character of normalized) {
  if(character==="(")depth++;
  if(character===")")depth--;
  assert(depth>=0,"Unbalanced receipt CREATE TABLE closing parenthesis");
}
assert.equal(depth,0,"Unbalanced receipt CREATE TABLE parentheses");
const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));
for(const [idx,tag] of [[100,"0100_reporting_source_event_receipts"],
  [101,"0101_reporting_source_private_snapshots"]]) {
  assert.equal(journal.entries.filter(row=>row.idx===idx&&row.tag===tag).length,1,
    "Missing reporting migration journal entry: "+tag);
}
console.log("Reporting migration source structure passes. PostgreSQL execution still required.");
