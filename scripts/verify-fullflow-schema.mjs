import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { verifyFullFlowNeonBranch } from "./verify-fullflow-neon-branch.mjs";

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

  await verifyFullFlowNeonBranch(url);
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
    learning_activity_sessions: ["id", "access_session_id", "student_profile_id", "site_id", "program_id", "section_id", "course_template_version_id", "started_at", "last_interaction_at", "estimated_active_ms"],
    learning_activity_events: ["id", "learning_session_id", "student_profile_id", "section_id", "course_template_version_id", "lesson_id", "kind", "client_event_id", "received_at", "estimated_active_ms"],
    program_site_authorizations: [
      "id", "program_id", "site_id", "host_organization_id", "institution_organization_id",
      "version", "status", "services", "requested_by_person_id", "evidence_document_id",
      "effective_from", "effective_through", "reviewed_by_person_id", "reviewed_at",
      "revoked_at", "revocation_reason",
    ],
    site_local_content_versions: [
      "id", "site_id", "revision", "status", "content", "flagged_fields",
      "created_by_person_id", "restored_from_revision", "created_at",
    ],
    guardian_relationships: ["can_manage_pickup"],
    incident_evidence: ["idempotency_key"],
    pickup_authorizations: ["id", "student_profile_id", "household_id", "program_id", "site_id", "pickup_person_id", "status", "source_key"],
    pickup_custody_holds: ["id", "student_profile_id", "household_id", "program_id", "site_id", "status", "source_key"],
    pickup_release_events: ["id", "student_profile_id", "attendance_event_id", "status", "identity_verified", "staff_witness_person_id", "occurred_at", "source_key"],
    safeguarding_case_assignments: ["id", "incident_id", "person_id", "responsibility", "revoked_at"],
    safeguarding_concerns: ["incident_id", "reporter_person_id", "idempotency_key", "student_profile_id", "policy_version", "acknowledgment_due_at"],
    safeguarding_external_reports: ["id", "incident_id", "reporter_person_id", "idempotency_key", "status", "occurred_at"],
    safeguarding_site_policies: ["id", "site_id", "jurisdiction_id", "procedure_version", "active"],
    safeguarding_site_responders: ["id", "site_id", "person_id", "responsibility"],
  };
  const requiredTables = Object.keys(required);
  const columns = await query`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY(${requiredTables})
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
    "learning_activity_events_client_uq",
    "program_site_authorization_version_uq",
    "program_site_authorization_current_uq",
    "site_local_content_site_revision_uq",
    "site_local_content_site_status_idx",
    "pickup_authorization_source_key_uq",
    "pickup_custody_hold_source_key_uq",
    "pickup_release_event_source_key_uq",
    "safeguarding_case_assignment_uq",
    "safeguarding_concern_reporter_idempotency_uq",
    "safeguarding_external_report_idempotency_uq",
    "safeguarding_site_policy_site_uq",
    "safeguarding_site_responder_role_uq",
    "incident_evidence_actor_idempotency_uq",
  ];
  const indexes = await query`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY(${requiredTables})
  `;
  const foundIndexes = new Set(indexes.map(row => row.indexname));
  const missingIndexes = expectedIndexes.filter(name => !foundIndexes.has(name));
  if (missingIndexes.length) {
    throw new Error(`FullFlow persistence constraints missing: ${missingIndexes.join(", ")}`);
  }
  console.log(`FullFlow isolated schema verified: ${entries.length} migrations, academic, safeguarding and pickup persistence checks.`);
}

main().catch(error => {
  console.error("FullFlow schema preflight failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
