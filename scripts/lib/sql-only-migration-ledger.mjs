import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/** Git tree object SHA of a checked-in SQL blob (not a plain SHA1 of text). */
export function gitBlobSha(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
}

/**
 * SQL-only migrations remain immutable, indexed and explicitly reviewed until
 * the Drizzle generated model can be reconciled against a disposable database.
 * This is source-integrity evidence, NOT database execution or model parity.
 */
export function verifySqlOnlyMigrationLedger(entries, ledger, options) {
  assert.equal(ledger.version, 1, "Unknown SQL-only migration ledger format");
  assert.equal(ledger.modelParityVerified, false,
    "Ledger cannot claim model parity without a generated snapshot reconciliation");
  assert.ok(Number.isInteger(ledger.lastGeneratedSnapshotIndex));
  assert.ok(Number.isInteger(ledger.currentSqlTipIndex));
  assert.ok(Array.isArray(ledger.sqlOnlyMigrations));
  const suffix = entries.filter(entry => entry.idx > ledger.lastGeneratedSnapshotIndex);
  assert.equal(entries.at(-1)?.idx, ledger.currentSqlTipIndex,
    "Migration journal advanced without a reviewed SQL-only ledger update");
  assert.equal(suffix.length, ledger.sqlOnlyMigrations.length,
    "SQL-only ledger must cover every journal entry after the modeled baseline");
  const accepted = new Map();
  for (let index = 0; index < suffix.length; index++) {
    const entry = suffix[index];
    const review = ledger.sqlOnlyMigrations[index];
    assert.equal(entry.idx, ledger.lastGeneratedSnapshotIndex + index + 1,
      "SQL-only migration sequence must be contiguous");
    assert.equal(review.idx, entry.idx, "SQL-only ledger index differs from journal");
    assert.equal(review.tag, entry.tag, "SQL-only ledger tag differs from journal");
    assert.equal(accepted.has(entry.idx), false, "Duplicate SQL-only migration index");
    assert.match(review.gitBlobSha, /^[a-f0-9]{40}$/);
    assert.equal(options.snapshotExists(entry.idx), false,
      "Unexpected generated snapshot at SQL-only migration " + entry.tag);
    const bytes = options.readSql(entry.tag);
    assert.ok(bytes.length > 0 && bytes.toString("utf8").trim(),
      "Empty SQL-only migration " + entry.tag);
    assert.equal(gitBlobSha(bytes), review.gitBlobSha,
      "Previously reviewed SQL-only migration changed: " + entry.tag);
    accepted.set(entry.idx, entry.tag);
  }
  return accepted;
}
