/** Strict, side-effect-free admission control for the journal migration alias.
 * This NEVER grants permission for a production Neon branch. The caller must
 * separately verify source SQL integrity before checking the live target.
 */
export const PRODUCTION_NEON_BRANCH = "br-restless-sea-ar9ooo55";

export function assertDisposableMigrationIntent(env, databaseUrl, journalTip) {
  if (env.CAN_MIGRATION_ENV !== "disposable")
    throw new Error("Refusing migration: explicit disposable environment is required");
  let target;
  try { target = new URL(databaseUrl ?? ""); }
  catch { throw new Error("Refusing migration: invalid DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !target.hostname.endsWith(".neon.tech") || !target.username ||
      !target.password || !target.pathname.slice(1)) {
    throw new Error("Refusing migration: target must be an explicit authenticated Neon database");
  }
  const projectId = env.CAN_MIGRATION_EXPECTED_PROJECT_ID;
  const branchId = env.CAN_MIGRATION_EXPECTED_BRANCH_ID;
  const databaseName = env.CAN_MIGRATION_EXPECTED_DATABASE;
  if (!/^br-[a-z0-9-]{8,}$/.test(branchId ?? "") || !/^[-a-z0-9]{6,}$/.test(projectId ?? "") ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(databaseName ?? "")) {
    throw new Error("Refusing migration: explicit Neon project, branch and database identity is required");
  }
  if (branchId === PRODUCTION_NEON_BRANCH)
    throw new Error("Refusing migration: Neon production main is not an authorized disposable target");
  if (!Number.isSafeInteger(journalTip) || journalTip < 1 ||
      env.CAN_MIGRATION_EXPECTED_JOURNAL_TIP !== String(journalTip)) {
    throw new Error("Refusing migration: reviewed migration journal tip must match");
  }
  if (env.CAN_MIGRATION_APPROVAL !== `DISPOSABLE_ONLY:${branchId}:${journalTip}`)
    throw new Error("Refusing migration: explicit branch- and journal-bound approval is required");
  return { projectId, branchId, databaseName };
}

export function assertVerifiedMigrationTarget(intent, identity) {
  if (!identity || identity.project_id !== intent.projectId ||
      identity.branch_id !== intent.branchId ||
      identity.database_name !== intent.databaseName) {
    throw new Error("Refusing migration: authenticated database identity differs from approved disposable target");
  }
  if (identity.branch_id === PRODUCTION_NEON_BRANCH)
    throw new Error("Refusing migration: production branch identity detected");
  return true;
}
