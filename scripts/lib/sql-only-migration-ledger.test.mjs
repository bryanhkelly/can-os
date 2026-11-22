import { test } from "node:test";
import assert from "node:assert/strict";
import { gitBlobSha, verifySqlOnlyMigrationLedger } from "./sql-only-migration-ledger.mjs";

const sql = "CREATE TABLE example (id uuid PRIMARY KEY);\n";
const baseline = [{ idx: 86, tag: "0086_baseline" }, { idx: 87, tag: "0087_manual" }];
const ledger = {
  version: 1, lastGeneratedSnapshotIndex: 86, currentSqlTipIndex: 87,
  modelParityVerified: false,
  sqlOnlyMigrations: [{ idx: 87, tag: "0087_manual", gitBlobSha: gitBlobSha(sql) }],
};
const options = {
  readSql: () => Buffer.from(sql),
  snapshotExists: () => false,
};

test("audits an exact immutable SQL-only journal suffix", () => {
  assert.deepEqual([...verifySqlOnlyMigrationLedger(baseline, ledger, options)],
    [[87, "0087_manual"]]);
});

test("rejects mutation of reviewed SQL", () => {
  assert.throws(() => verifySqlOnlyMigrationLedger(baseline, ledger, {
    ...options, readSql: () => Buffer.from(sql + "DROP TABLE example;"),
  }), /Previously reviewed SQL-only migration changed/);
});

test("rejects undocumented journal advances", () => {
  assert.throws(() => verifySqlOnlyMigrationLedger([...baseline,
    { idx: 88, tag: "0088_manual" }], ledger, options),
  /advanced without a reviewed SQL-only ledger update/);
});

test("rejects fictional generated snapshots and unsupported parity claims", () => {
  assert.throws(() => verifySqlOnlyMigrationLedger(baseline, ledger, {
    ...options, snapshotExists: () => true,
  }), /Unexpected generated snapshot/);
  assert.throws(() => verifySqlOnlyMigrationLedger(baseline, {
    ...ledger, modelParityVerified: true,
  }, options), /cannot claim model parity/);
});

test("matches known Git blob encoding", () => {
  assert.equal(gitBlobSha("hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a");
});
