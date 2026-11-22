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
const access = statementsFor("drizzle/0102_reporting_source_service_access.sql");
assert.equal(access.statements.length, 11, "Reporting access migration statement count changed");
assert.match(access.statements[0], /CREATE ROLE can_reporting_service NOLOGIN/);
assert.match(access.statements[0], /rolcanlogin OR rolbypassrls OR rolsuper OR rolcreaterole/);
assert.match(access.sql, /GRANT USAGE ON SCHEMA public TO can_reporting_service/);
for (const [table, actions] of [
  ["reporting_source_event_receipts", ["SELECT","INSERT","UPDATE"]],
  ["reporting_source_snapshots", ["SELECT","INSERT"]],
  ["reporting_source_snapshot_events", ["SELECT","INSERT"]],
]) {
  const expected = table === "reporting_source_event_receipts"
    ? ["reporting_receipts_service_select","reporting_receipts_service_insert",
       "reporting_receipts_service_retry"]
    : table === "reporting_source_snapshots"
      ? ["reporting_snapshots_service_select","reporting_snapshots_service_insert"]
      : ["reporting_membership_service_select","reporting_membership_service_insert"];
  for (const name of expected) {
    assert.equal(access.statements.filter(statement =>
      statement.includes("CREATE POLICY " + name + " ON public." + table) &&
      statement.includes("TO can_reporting_service")).length, 1,
      "Missing restricted reporting policy: " + name);
  }
  for (const action of actions) {
    assert(access.sql.includes("FOR " + action + " TO can_reporting_service"),
      "Missing reporting " + action + " policy for " + table);
  }
}
assert(!/GRANT\s+can_reporting_service\s+TO\s+/i.test(access.sql),
  "A migration cannot assign reporting service membership to a runtime login");
assert(!/CREATE\s+POLICY[^;]*\bTO\s+(PUBLIC|anonymous|authenticated)\b/i.test(access.sql),
  "Reporting access must not expose policies to unverified callers");

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
  [101,"0101_reporting_source_private_snapshots"],
  [102,"0102_reporting_source_service_access"]]) {
  assert.equal(journal.entries.filter(row=>row.idx===idx&&row.tag===tag).length,1,
    "Missing reporting migration journal entry: "+tag);
}

/**
 * Compare named DB constraints and immutable membership keys with the Drizzle
 * model and read-only preflight. A SQL-only migration can be valid while the
 * TypeScript model or acceptance gate still targets a different schema.
 * Source syntax and TypeScript are checked separately after npm ci.
 */
const receiptModel=readFileSync("src/db/schema/reporting-source-event-receipts.ts","utf8");
const snapshotModel=readFileSync("src/db/schema/reporting-source-snapshots.ts","utf8");
const snapshotPreflight=readFileSync("scripts/acceptance/check-reporting-source-snapshot-schema.mjs","utf8");
const modelCheckNames=source=>[...source.matchAll(/\bcheck\(\s*"([^"]+)"/g)]
  .map(match=>match[1]).sort();
const sqlCheckNames=source=>[...source.matchAll(/CONSTRAINT\s+"([^"]+)"\s+CHECK\s*\(/g)]
  .map(match=>match[1]).sort();
assert.deepEqual(modelCheckNames(receiptModel),sqlCheckNames(receipt.sql),
  "Reporting receipt Drizzle CHECK constraints disagree with migration 0100");
assert.deepEqual(modelCheckNames(snapshotModel),sqlCheckNames(snapshots.sql),
  "Reporting snapshot Drizzle CHECK constraints disagree with migration 0101");
const memberPk=snapshotModel.match(/primaryKey\(\{\s*name:\s*"([^"]+)"/)?.[1];
assert(memberPk,"Composite source snapshot primary key must have a stable explicit name");
assert(snapshots.sql.includes('CONSTRAINT "'+memberPk+'" PRIMARY KEY'),
  "Snapshot model primary key name differs from SQL migration");
assert(snapshotPreflight.includes('"'+memberPk+'"'),
  "Read-only snapshot preflight expects a different primary key name");

console.log("Reporting migration source structure passes. PostgreSQL execution still required.");
