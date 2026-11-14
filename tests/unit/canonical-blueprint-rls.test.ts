import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  resolve("database/canonical/v3.0.1/schema.sql"), "utf8"
);
const provisioning = readFileSync(
  resolve("database/canonical/v3.0.1/provision-blueprint-roles.sql"), "utf8"
);

describe("canonical v3.0.1 Blueprint authorization contract", () => {
  it("requires independent Organization purposes for author and reviewer", () => {
    expect(provisioning).toContain("can_v30_blueprint_author_");
    expect(provisioning).toContain("can_v30_blueprint_reviewer_");
    expect(provisioning).toContain("'blueprint_author'");
    expect(provisioning).toContain("'blueprint_reviewer'");
    expect(provisioning).toContain("WITH INHERIT FALSE, SET TRUE");
  });

  it("forces row security on authoritative draft and review tables", () => {
    expect(schema).toContain("'blueprint_configurations','blueprint_configuration_versions'");
    expect(schema).toContain("'canonical_accounts','canonical_account_grants','canonical_sessions'");
    expect(schema).toContain("'blueprint_execution_batches','education_operations'");
    expect(schema).toContain("blueprint_configuration_versions_freeze");
    expect(schema).toContain("blueprint_reviews_insert");
    expect(schema).toContain("blueprint_component_decisions_insert");
    expect(schema).toContain("blueprint_audit_insert");
  });

  it("requires an approved current Operation operator for a planning Deployment", () => {
    expect(schema).toContain("blueprint_operation_roles_read");
    expect(schema).toContain("blueprint_deployments_insert");
    expect(schema).toContain("status='planning'");
    expect(schema).toContain("r.role_code='operator'");
    expect(schema).toContain("r.status='approved'");
    expect(schema).toContain("v28_role_can_access_org(r.organization_id,'blueprint_author')");
  });

  it("does not confer learner, safeguarding or finance access to Blueprint roles", () => {
    expect(provisioning).not.toContain("GRANT ALL");
    expect(provisioning).not.toContain("GRANT UPDATE ON");
    expect(provisioning).not.toContain("GRANT SELECT ON education_v30.canonical_sessions");
    expect(provisioning).not.toContain("GRANT SELECT ON education_v30.learner_profiles");
    expect(provisioning).toContain("GRANT UPDATE (execution_status,executed_by_person_id,executed_at)");
    expect(schema).toContain("blueprint_execution_domain_event_insert");
  });
});
