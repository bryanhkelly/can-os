import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** Static source checks; live PostgreSQL and authenticated browser tests remain required. */
describe("canonical learner/room database release contract", () => {
  it("preserves both sealed login projections and denied direct owner-table access", () => {
    const roles = read("database/canonical/v3.0.1/verify-learning-release-roles.sql");
    expect(roles).toContain("can_os_canonical_auth_app");
    expect(roles).toContain("raw_sessions_denied");
    expect(roles).toContain("unauthorized_pairing_denied");
    expect(roles).toContain("scoped_wallet_role_available");
  });
  it("enforces current pairing expiry in both new and installed database schemas", () => {
    const patch = read("database/canonical/v3.0.1/patch-learning-session-integrity.sql");
    const upgrade = read("database/canonical/v3.0.1/patch-facilitated-pair-expiry.sql");
    const fresh = read("database/canonical/v3.0.1/schema.sql");
    for (const source of [patch, upgrade, fresh]) {
      expect(source).toContain("pairing_expires_at<=clock_timestamp()");
      expect(source).toContain("interval '8 hours'");
      expect(source).toContain("v301_guard_facilitated_pair_identity");
    }
  });
  it("retains rollback-safe multi-organization and valid-room integration fixtures", () => {
    for (const path of [
      "database/canonical/v3.0.1/test-learning-tenant-acceptance.sql",
      "database/canonical/v3.0.1/test-learning-valid-room-test01.sql",
    ]) {
      const script = read(path);
      expect(script).toContain("EXCEPTION WHEN SQLSTATE 'PZ001'");
      expect(script).toMatch(/(?:ROLLBACK_QA_ROOM_FIXTURE|CAN_TEST_FIXTURE_ROLLBACK)/);
    }
  });
});
