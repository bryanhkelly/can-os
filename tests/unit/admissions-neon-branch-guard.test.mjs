import { describe, expect, it } from "vitest";
import {
  assertAdmissionsNeonIdentity,
  assertExpectedAdmissionsBranchId,
  ADMISSIONS_NEON_PROJECT_ID,
  ADMISSIONS_PRODUCTION_BRANCH_ID,
} from "../../scripts/verify-admissions-neon-branch.mjs";

const TEST_BRANCH = "br-proud-pine-arfju8h2";

describe("Admissions Neon identity guard", () => {
  it("accepts a positively identified, configured nonproduction CAN OS branch", () => {
    expect(() => assertAdmissionsNeonIdentity({
      project_id: ADMISSIONS_NEON_PROJECT_ID,
      branch_id: TEST_BRANCH,
    }, TEST_BRANCH)).not.toThrow();
  });

  it("requires a well-formed nonproduction branch configuration", () => {
    for (const configured of [undefined, "", "production", "br-INVALID", ADMISSIONS_PRODUCTION_BRANCH_ID]) {
      expect(() => assertExpectedAdmissionsBranchId(configured))
        .toThrow(/explicit nonproduction CAN_ADMISSIONS_TEST_BRANCH_ID/);
    }
  });

  it("rejects production even when configured as the expected branch", () => {
    expect(() => assertAdmissionsNeonIdentity({
      project_id: ADMISSIONS_NEON_PROJECT_ID,
      branch_id: ADMISSIONS_PRODUCTION_BRANCH_ID,
    }, ADMISSIONS_PRODUCTION_BRANCH_ID)).toThrow(/explicit nonproduction/);
  });

  for (const [label, identity] of [
    ["wrong test branch", { project_id: ADMISSIONS_NEON_PROJECT_ID, branch_id: "br-bitter-feather-ar0u63x7" }],
    ["production branch", { project_id: ADMISSIONS_NEON_PROJECT_ID, branch_id: ADMISSIONS_PRODUCTION_BRANCH_ID }],
    ["wrong Neon project", { project_id: "another-project", branch_id: TEST_BRANCH }],
    ["missing database settings", { project_id: null, branch_id: null }],
    ["missing row", undefined],
  ]) {
    it("refuses " + label, () => {
      expect(() => assertAdmissionsNeonIdentity(identity, TEST_BRANCH))
        .toThrow(/Postgres-attested Neon project\/branch differs/);
    });
  }
});
