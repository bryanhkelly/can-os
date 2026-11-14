/**
 * Fail closed: recorded-instructor database acceptance belongs to the
 * designated test01 Neon branch, never test01, main or another branch.
 * These values are verified from PostgreSQL's own Neon identity settings,
 * not from a caller-controlled environment variable or database hostname.
 */
export const RECORDED_INSTRUCTION_NEON_PROJECT_ID = "sweet-hall-62441909";
export const RECORDED_INSTRUCTION_NEON_BRANCH_ID = "br-bitter-feather-ar0u63x7";

export function assertRecordedInstructorNeonBranch(identity) {
  if (identity?.project_id !== RECORDED_INSTRUCTION_NEON_PROJECT_ID ||
      identity?.branch_id !== RECORDED_INSTRUCTION_NEON_BRANCH_ID) {
    throw new Error("Recorded-instructor acceptance requires the designated test01 Neon branch.");
  }
}

export async function verifyRecordedInstructorNeonBranch(client) {
  const { rows } = await client.query(`
    SELECT current_setting('neon.project_id',true) AS project_id,
           current_setting('neon.branch_id',true) AS branch_id
  `);
  if (rows.length !== 1) {
    throw new Error("Recorded-instructor acceptance could not verify Neon branch identity.");
  }
  assertRecordedInstructorNeonBranch(rows[0]);
  return rows[0];
}
