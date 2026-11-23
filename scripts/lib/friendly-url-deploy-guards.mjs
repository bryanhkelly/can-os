import assert from "node:assert/strict";

/** A release contract, not a migration runner or a feature flag. */
export function assertFriendlyUrlDeployment(identity, schema, roles, recorded, expectedMigrations) {
  assert.equal(identity?.projectId, "sweet-hall-62441909",
    "BLOCKED: DATABASE_URL must target the CAN OS Neon project");
  assert.equal(identity?.branchId, "br-restless-sea-ar9ooo55",
    "BLOCKED: DATABASE_URL must target the approved production main branch");
  assert.equal(identity?.databaseName, "neondb",
    "BLOCKED: unexpected database name");
  for (const [name, value] of Object.entries(schema ?? {})) {
    assert.equal(value, true, "BLOCKED: required friendly URL schema/constraint absent: " + name);
  }
  assert.equal(roles?.count, 2,
    "BLOCKED: both anonymous and authenticated database roles must exist");
  assert.equal(roles?.unauthorizedSelects, 0,
    "BLOCKED: public database roles have direct private Site or Go Link SELECT");
  assert.equal(roles?.applicationCanRead, true,
    "BLOCKED: deployment application DB role cannot read required private Site/Go Link tables");
  assert.equal(roles?.applicationCanBypassGoRls, true,
    "BLOCKED: application DB role cannot read protected Go Link table with RLS");
  for (const expected of expectedMigrations) {
    const applied = recorded.find(row => Number(row.createdAt) === expected.when);
    assert.ok(applied, "BLOCKED: migration not applied: " + expected.tag);
    assert.equal(applied.hash, expected.hash,
      "BLOCKED: applied SQL differs from reviewed migration: " + expected.tag);
  }
}
