import test from "node:test";
import assert from "node:assert/strict";
import {comparePilotMigrationLedger} from "./pilot-migration-ledger.mjs";
const entries=[{tag:"0079_example",created_at:100,hash:"a".repeat(64)},{tag:"0080_example",created_at:200,hash:"b".repeat(64)}];
test("exact modern ledger with valid historical baseline is ready",()=>{
  assert.equal(comparePilotMigrationLedger(entries,[{created_at:"10",hash:"c".repeat(64)},...entries]).ready,true);
});
test("missing or changed migration blocks acceptance",()=>{
  const r=comparePilotMigrationLedger(entries,[{created_at:"100",hash:"d".repeat(64)}]);
  assert.deepEqual(r.issues,[{kind:"hash_mismatch",tag:"0079_example"},{kind:"missing",tag:"0080_example"}]);
  assert.equal(r.ready,false);
});
test("malformed historical hash and duplicate or unexpected modern rows block",()=>{
  const r=comparePilotMigrationLedger(entries,[{created_at:"10",hash:"bad"},...entries,entries[0],{created_at:"300",hash:"c".repeat(64)}]);
  assert.deepEqual(r.issues.map(i=>i.kind),["malformed_hash","duplicate_timestamp","unexpected_migration"]);
  assert.equal(r.ready,false);
});
