import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("database/canonical/v3.0.1/seed-canonical-demo.sql"), "utf8");
const ddl = readFileSync(resolve("database/canonical/v3.0.1/schema.sql"), "utf8");
const runner = readFileSync(resolve("scripts/seed-canonical-v301-demo.mjs"), "utf8");

describe("native canonical v3.0.1 demo", () => {
  it("creates two independent Site operators without a mandatory network", () => {
    expect(sql).toContain("Valor School");
    expect(sql).toContain("Barton Community Learning Center");
    expect(sql).toContain("'operator'");
    expect(sql).toContain("canonical_account_grants");
    expect(sql).not.toContain("network_memberships");
    expect(sql).not.toContain("public.");
  });

  it("provides separate administrators and independent reviewers", () => {
    expect(sql).toContain("valor.admin@can.example");
    expect(sql).toContain("barton.admin@can.example");
    expect(sql).toContain("valor.reviewer@can.example");
    expect(sql).toContain("barton.reviewer@can.example");
    expect((sql.match(/'blueprint_reviewer'/g) ?? []).length).toBe(2);
  });

  it("uses native-only accounts, sessions and grants with forced row security", () => {
    for (const table of ["canonical_accounts", "canonical_account_grants", "canonical_sessions"]) {
      expect(ddl).toContain(`CREATE TABLE ${table} (`);
      expect(ddl).toContain(`'${table}'`);
    }
    expect(ddl).toContain("v301_canonical_session_context");
    expect(ddl).toContain("REVOKE ALL ON FUNCTION v301_canonical_session_context(text) FROM PUBLIC");
    expect(ddl).not.toContain("canonical_legacy_");
  });

  it("requires an isolated test database and never seeds credentials by default", () => {
    expect(runner).toContain("APP_ENV !== \"test\"");
    expect(runner).toContain("assertIsolatedTestDatabaseTarget");
    expect(runner).toContain("--issue-session=");
    expect(sql).not.toContain("secret_hash");
    expect(sql).not.toContain("canonical_sessions");
  });
});
