import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Static contract checks only. Not a substitute for running PostgreSQL. */
const sql = readFileSync(resolve(process.cwd(),
  "database/canonical/v3.0.1/patch-achievement-credentials.sql"), "utf8");
const baseline = readFileSync(resolve(process.cwd(),
  "database/canonical/v3.0.1/schema.sql"), "utf8");

describe("credential patch structural security boundaries", () => {
  it("does not collide with existing canonical credential tables", () => {
    expect(baseline).toContain("CREATE TABLE credential_definitions (");
    expect(baseline).toContain("CREATE TABLE credential_issuances (");
    expect(sql).not.toContain("CREATE TABLE credential_definitions (");
    expect(sql).not.toContain("CREATE TABLE credential_issuances (");
    expect(sql).toContain("CREATE TABLE learning_award_definitions (");
    expect(sql).toContain("CREATE TABLE learning_award_issuances (");
  });
  it("retains canonical noncredit completion rather than creating grades or credits", () => {
    expect(sql).toContain("REFERENCES noncredit_completion_decisions(id)");
    expect(sql).toContain("REFERENCES noncredit_completion_certificates(id)");
    expect(sql).not.toMatch(/CREATE TABLE (section_grades|transcript_issuances)/);
  });
  it("requires independent definition approval and valid publisher grants", () => {
    expect(sql).toContain("created_by_person_id uuid NOT NULL");
    expect(sql).toContain("approved_by_person_id<>created_by_person_id");
    expect(sql).toContain("v301_guard_credential_version");
    expect(sql).toContain("canonical_account_grants");
    expect(sql).toContain("active issuer staff grant");
  });
  it("fails closed for youth activity awards until verified registrations and attendance are integrated", () => {
    expect(sql).toContain("Verified activity award source is not yet enabled");
  });
  it("enforces immutable evidence, restricted RLS and live verification", () => {
    expect(sql).toContain("credential_owner_only");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("v301_credential_is_current");
    expect(sql).toContain("credential_revocation_provenance");
    expect(sql).toContain("learning_award_issuances_immutable");
    expect(sql).toContain("learning_award_issuance_events_immutable");
  });
});
