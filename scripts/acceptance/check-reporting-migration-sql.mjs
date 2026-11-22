#!/usr/bin/env node
/**
 * Fast source-level guard against malformed or duplicated migration 0100.
 * This is not a substitute for execution in an isolated PostgreSQL branch.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const migration = readFileSync("drizzle/0100_reporting_source_event_receipts.sql", "utf8");
const statements = migration.split(/^--> statement-breakpoint\\s*$/m)
  .map(s => s.trim()).filter(Boolean);
assert.equal(statements.length, 12, "Migration 0100 statement count changed");
const creation = statements[0];
assert.match(creation,/^--[\\s\\S]*?CREATE TABLE "public"."reporting_source_event_receipts"/);
for(const col of ["event_id","source_id","source_version","dedup_key",
  "payload_fingerprint","organization_id","site_id","program_id",
  "correction_of_event_id","attempts","next_attempt_at"]){
  assert(creation.includes('"'+col+'"'),"Missing reporting receipt column: "+col);
}
for(const constraint of ["reporting_source_receipt_status_ck",
  "reporting_source_receipt_data_ck","reporting_source_receipt_identity_ck",
  "reporting_source_retry_state_ck"]){
  assert.equal(migration.split('"'+constraint+'"').length-1,1,
    "Constraint must be defined exactly once: "+constraint);
}
assert(creation.includes("'^[0-9a-f]{64}$'"),"Full SHA-256 pattern required");
assert(creation.trimEnd().endsWith(");"),"CREATE TABLE must be complete");
const indexNames = ["reporting_source_canonical_revision_uq",
 "reporting_source_site_period_idx","reporting_source_program_period_idx",
 "reporting_source_correction_idx","reporting_source_retry_idx",
 "reporting_source_outbox_scope_period_idx"];
for(const name of indexNames) assert.equal(
  statements.filter(s=>s.startsWith("CREATE")&&s.includes('"'+name+'"')).length,1,
  "Migration index must be declared exactly once: "+name);
assert.equal(statements.filter(s=>s.includes("CREATE TRIGGER guard_reporting_source_receipt_mutation")).length,1);
assert.equal(statements.filter(s=>s.includes("ENABLE ROW LEVEL SECURITY")).length,1);
assert.equal(statements.filter(s=>s.includes("FORCE ROW LEVEL SECURITY")).length,1);
const balanced = creation.replace(/'([^']|'')*'/g, "''").replace(/--[^\\n]*/g, "");
let depth=0;
for(const char of balanced) {
  if(char==="(")depth++;
  else if(char===")")depth--;
  assert(depth>=0,"Unbalanced SQL close parenthesis");
}
assert.equal(depth,0,"Unbalanced CREATE TABLE parentheses");
console.log("Migration 0100 source checks passed (PostgreSQL execution still required).");
