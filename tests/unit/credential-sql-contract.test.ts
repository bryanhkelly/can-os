import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Static contract checks only. Not a substitute for running PostgreSQL. */
const sql = readFileSync(resolve(process.cwd(),
  "database/canonical/v3.0.1/patch-achievement-credentials.sql"), "utf8");
const baseline = readFileSync(resolve(process.cwd(),
  "database/canonical/v3.0.1/schema.sql"), "utf8");

describe("credential patch structural security boundaries", () => {
  it("keeps the standalone upgrade patch identical to the fresh-install DDL", () => {
    const patchBody = sql.split("SET LOCAL search_path = education_v30, public;\n")[1]
      ?.split(/\nCOMMIT;\s*$/)[0]?.trim();
    expect(patchBody).toBeTruthy();
    expect(baseline).toContain(patchBody);
  });
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
  it("offers only session-bound SECURITY DEFINER wallet projections", () => {
    expect(baseline).toContain("v301_list_my_learning_awards(p_secret_hash text)");
    expect(baseline).toContain("v301_get_my_learning_award(p_secret_hash text,p_issuance_id uuid)");
    expect(baseline).toContain("v301_canonical_session_context(p_secret_hash) ctx");
    expect(baseline).toContain("decision.recipient_person_id=ctx.person_id");
    expect(baseline).toContain("issuance.issuer_organization_id=ctx.organization_id");
    expect(baseline).toContain("ctx.role_code='learner'");
    expect(baseline).toContain("REVOKE ALL ON FUNCTION v301_get_my_learning_award(text,uuid) FROM PUBLIC");
    expect(baseline).toContain("SET search_path=education_v30,pg_catalog,pg_temp AS $credential_wallet$");
    const readerRole = readFileSync(resolve(process.cwd(),
      "database/canonical/v3.0.1/provision-credential-learner-reader.sql"), "utf8");
    expect(readerRole).toContain("GRANT EXECUTE ON FUNCTION");
    expect(readerRole).toContain("NOLOGIN NOINHERIT NOBYPASSRLS");
    expect(readerRole).not.toMatch(/GRANT SELECT ON education_v30\.learning_award_/);
    expect(readerRole).not.toContain("GRANT SELECT ON education_v30.canonical_sessions");
  });
  it("enforces immutable evidence, restricted RLS and live verification", () => {
    expect(sql).toContain("credential_owner_only");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("v301_credential_is_current");
    expect(sql).toContain("credential_revocation_provenance");
    expect(sql).toContain("certificate_reference IS DISTINCT FROM NEW.credential_reference");
    expect(sql).toContain("legacy.certificate_reference=issuance.credential_reference");
    expect(sql).toContain("decision.noncredit_completion_decision_id IS NOT NULL");
    expect(sql).toContain("'pdf','badge_json','png','svg'");
    expect(sql).toContain("learning_award_issuances_immutable");
    expect(sql).toContain("learning_award_issuance_events_immutable");
  });
});
