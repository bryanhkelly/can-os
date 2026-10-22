import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

/**
 * Read-only, branch-scoped guard for the connected FullFlow acceptance suite.
 * A passing TypeScript check does not prove that its target DB has the schema.
 * Invoked only after run-integration-tests has verified test DB isolation.
 */
async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || process.env.CAN_TEST_DB_WRITES_ENABLED !== "true") {
    throw new Error("FullFlow schema verification requires the guarded TEST_DATABASE_URL.");
  }

  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  const entries = journal.entries;
  const latest = entries?.at(-1);
  if (!latest || !/^[0-9]{4}_[a-z0-9_]+$/.test(latest.tag)) {
    throw new Error("Invalid or empty Drizzle migration journal.");
  }
  const migrationSql = readFileSync(new URL(`../drizzle/${latest.tag}.sql`, import.meta.url));
  const expectedHash = createHash("sha256").update(migrationSql).digest("hex");

  const query = neon(url);
  const [ledger] = await query`
    SELECT hash, created_at,
      (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS applied_count
    FROM drizzle.__drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1
  `;
  if (!ledger || ledger.applied_count !== entries.length ||
      String(ledger.created_at) !== String(latest.when) || ledger.hash !== expectedHash) {
    throw new Error(
      `Drizzle schema drift: expected ${entries.length} migrations ending at ${latest.tag}; ` +
      `isolated DB reports ${ledger?.applied_count ?? 0} with a mismatched latest migration. ` +
      "Migrate the isolated branch before running FullFlow.",
    );
  }

  const required = {
    auth_request_rate_limits: ["route", "window_started_at", "request_count"],
    access_sessions: ["id", "account_id", "secret_hash", "active_grant_id", "expires_at", "revoked_at", "created_at", "updated_at"],
    lesson_progress: ["id", "section_id", "course_template_version_id", "student_profile_id", "lesson_id", "completed_at"],
    submissions: ["id", "assessment_id", "student_profile_id", "status", "attempt_number", "submitted_at", "graded_at", "score"],
  };
  const columns = await query`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('auth_request_rate_limits', 'access_sessions', 'lesson_progress', 'submissions')
  `;
  const present = new Set(columns.map(row => `${row.table_name}.${row.column_name}`));
  const missing = Object.entries(required).flatMap(([table, names]) =>
    names.filter(name => !present.has(`${table}.${name}`)).map(name => `${table}.${name}`));
  if (missing.length) throw new Error(`FullFlow persistence columns missing: ${missing.join(", ")}`);

  const expectedIndexes = [
    "auth_request_rate_limits_pkey",
    "access_sessions_secret_uq",
    "lesson_progress_student_section_version_lesson_uq",
    "submission_attempt_uq",
  ];
  const indexes = await query`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
      AND tablename IN ('auth_request_rate_limits', 'access_sessions', 'lesson_progress', 'submissions')
  `;
  const foundIndexes = new Set(indexes.map(row => row.indexname));
  const missingIndexes = expectedIndexes.filter(name => !foundIndexes.has(name));
  if (missingIndexes.length) {
    throw new Error(`FullFlow persistence constraints missing: ${missingIndexes.join(", ")}`);
  }
  console.log(`FullFlow isolated schema verified: ${entries.length} migrations, session/auth/learning tables and uniqueness indexes.`);
}

main().catch(error => {
  console.error("FullFlow schema preflight failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
