import { describe, expect, it } from "vitest";
import {
  RECORDED_INSTRUCTION_NEON_PROJECT_ID,
  RECORDED_INSTRUCTION_NEON_BRANCH_ID,
  assertRecordedInstructorNeonBranch,
  verifyRecordedInstructorNeonBranch,
} from "../../scripts/verify-recorded-instructor-neon-branch.mjs";

describe("recorded instructor Neon acceptance target", () => {
  const valid = {
    project_id: RECORDED_INSTRUCTION_NEON_PROJECT_ID,
    branch_id: RECORDED_INSTRUCTION_NEON_BRANCH_ID,
  };

  it("accepts only the designated db3.01 branch", () => {
    expect(() => assertRecordedInstructorNeonBranch(valid)).not.toThrow();
    expect(() => assertRecordedInstructorNeonBranch({
      ...valid, branch_id: "br-bitter-feather-ar0u63x7",
    })).toThrow(/db3\.01/);
    expect(() => assertRecordedInstructorNeonBranch({
      ...valid, branch_id: "br-restless-sea-ar9ooo55",
    })).toThrow(/db3\.01/);
    expect(() => assertRecordedInstructorNeonBranch({
      ...valid, project_id: "some-other-project",
    })).toThrow(/db3\.01/);
  });

  it("verifies the branch from PostgreSQL rather than a supplied label", async () => {
    const client = { query: async () => ({ rows: [valid] }) };
    await expect(verifyRecordedInstructorNeonBranch(client)).resolves.toEqual(valid);
    const wrong = { query: async () => ({ rows: [{ ...valid,
      branch_id: "br-bitter-feather-ar0u63x7" }] }) };
    await expect(verifyRecordedInstructorNeonBranch(wrong)).rejects.toThrow(/db3\.01/);
  });
});
