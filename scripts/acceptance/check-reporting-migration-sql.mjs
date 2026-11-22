#!/usr/bin/env node
/**
 * Source-structure gate for migration 0100.
 * Fast and dependency-free; a PostgreSQL integration run is still mandatory.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("drizzle/0100_reporting_source_event_receipts.sql", "utf8");
const statements = sql.split(/^--> statement-breakpoint\s*$/m)
  .map(statement => statement.trim()).filter(Boolean);
assert.equal(statements.length, 13, "Migration 0100 statement count drifted");

const create = statements[0];
assert.match(create, /^--[\s\S]*?CREATE TABLE "public"."reporting_source_event_receipts"/);
assert(create.trimEnd().endsWith(");"), "CREATE TABLE statement is unfinished");
for (const col of ["event_id", "source_id", "source_version", "dedup_key",
  "payload_fingerprint", "organization_id", "site_id", "program_id",
  "correction_of_event_id", "attempts", "next_attempt_at"]) {
  assert(create.includes('"' + col + '"'), "Receipt column missing: " + col);
}
for (const constraint of ["reporting_source_receipt_status_ck",
  "reporting_source_receipt_data_ck", "reporting_source_receipt_identity_ck",
  "reporting_source_retry_state_ck"]) {
  assert.equal((create.match(new RegExp('"' + constraint + '"', "g")) ?? []).length, 1,
    "Receipt constraint defined more or less than once: " + constraint);
}
assert(create.includes("'^[0-9a-f]{64}$'"), "Full SHA-256 regex missing");
const indexNames = ["reporting_source_canonical_revision_uq",
  "reporting_source_site_period_idx", "reporting_source_program_period_idx",
  "reporting_source_correction_idx", "reporting_source_retry_idx",
  "reporting_source_outbox_scope_period_idx"];
for (const name of indexNames) {
  assert.equal(statements.filter(statement =>
    statement.startsWith("CREATE") && statement.includes('"' + name + '"')).length, 1,
    "Index definition missing or repeated: " + name);
}
for (const marker of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY",
  "CREATE TRIGGER guard_reporting_source_receipt_mutation"]) {
  assert.equal(statements.filter(statement => statement.includes(marker)).length, 1,
    "Security/immutability statement missing or repeated: " + marker);
}
const withoutStringsAndComments = create
  .replace(/'([^']|'')*'/g, "''").replace(/--[^\n]*/g, "");
let depth = 0;
for (const character of withoutStringsAndComments) {
  if (character === "(") ++depth;
  if (character === ")") --depth;
  assert(depth >= 0, "Unbalanced SQL closing parenthesis");
}
assert.equal(depth, 0, "Unbalanced CREATE TABLE parentheses");
const snapshotSql = readFileSync("drizzle/0101_reporting_source_private_snapshots.sql", "utf8");
const snapshotStatements = snapshotSql.split(/^--> statement-breakpoint\s*$/m)
  .map(statement => statement.trim()).filter(Boolean);
assert.equal(snapshotStatements.length, 13, "Migration 0101 statement count changed");
for(const name of ["reporting_source_snapshots", "reporting_source_snapshot_events"]) {
  assert.equal(snapshotStatements.filter(statement =>
    statement.includes('CREATE TABLE "public"."' + name + '"')).length,1,
    "Snapshot table missing or repeated: "+name);
  assert.equal(snapshotStatements.filter(statement =>
    statement.includes('ALTER TABLE "public"."' + name + '" ENABLE ROW LEVEL SECURITY')).length,1);
  assert.equal(snapshotStatements.filter(statement =>
    statement.includes('ALTER TABLE "public"."' + name + '" FORCE ROW LEVEL SECURITY')).length,1);
}
for (const name of ["guard_reporting_source_snapshot_mutation",
  "guard_reporting_source_snapshot_membership_mutation"]) {
  assert.equal(snapshotStatements.filter(statement =>
    statement.includes("CREATE TRIGGER "+name)).length,1);
}
assert(snapshotSql.includes('"manifest_digest" ~ ') &&
  snapshotSql.includes("'^[0-9a-f]{64}
"),"Immutable manifest digest validation missing");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));
for(const [idx,tag] of [[100,"0100_reporting_source_event_receipts"],
  [101,"0101_reporting_source_private_snapshots"]]) {
  assert.equal(journal.entries.filter(entry=>entry.idx===idx&&entry.tag===tag).length,1,
    "Missing exact migration journal entry: "+tag);
}
console.log("Reporting migrations 0100 and 0101 structure passed. PostgreSQL integration remains required.");
