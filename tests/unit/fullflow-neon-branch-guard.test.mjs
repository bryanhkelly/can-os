import { describe, expect, it } from "vitest";
import {
  assertFullFlowNeonIdentity, FULLFLOW_NEON_PROJECT_ID, FULLFLOW_NEON_BRANCH_ID,
} from "../../scripts/verify-fullflow-neon-branch.mjs";

describe("FullFlow Neon project + branch identity guard", () => {
  it("accepts only the approved, verified branch", () => {
    expect(() => assertFullFlowNeonIdentity({
      project_id: FULLFLOW_NEON_PROJECT_ID,
      branch_id: FULLFLOW_NEON_BRANCH_ID,
    })).not.toThrow();
  });
  for (const [description, identity] of [
    ["test01", { project_id: FULLFLOW_NEON_PROJECT_ID, branch_id: "br-bitter-feather-ar0u63x7" }],
    ["production", { project_id: FULLFLOW_NEON_PROJECT_ID, branch_id: "br-restless-sea-ar9ooo55" }],
    ["other project", { project_id: "another-project", branch_id: FULLFLOW_NEON_BRANCH_ID }],
    ["missing server identity", { project_id: null, branch_id: null }],
    ["missing result", undefined],
  ]) {
    it("rejects " + description, () => {
      expect(() => assertFullFlowNeonIdentity(identity)).toThrow(/dedicated fullflow-e2e-20261022 Neon branch/);
    });
  }
});
