import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { verifyFullFlowNeonBranch } from "./verify-fullflow-neon-branch.mjs";
import { assessPost0051MigrationArtifacts, assessPost0056MigrationArtifacts } from "./fullflow-post0051-artifacts.mjs";

/**
 * READ-ONLY migration preflight for the one dedicated FullFlow Neon branch.
 * Does not change columns, enums, constraints, rows or Drizzle migration ledger.
 * Executing DDL and reviewing dropped/replaced constraints is a separate step.
 */
const pendingTags = [
  "0032_extended_program_offerings",
  "0033_extended_season_drafts",
  "0034_enrichment_packages",
  "0035_site_publications",
  "0036_program_publications",
  "0037_public_admissions_interests",
  "0038_public_interest_conversion",
];

// Staged migrations reviewed for the dedicated branch after the 0032-0038
// batch landed. The committed journal prefix from idx 39 must match this
// exact order; any other staged entry makes the journal unrecognized.
const stagedTags = [
  "0039_program_site_authorizations",
  "0040_site_local_content",
  "0041_pending_guardian_access_defaults",
  "0042_public_family_start_requests",
  "0043_student_access_consents",
  "0044_school_configuration_operating_approval",
  "0045_onsite_safety_qualification_definitions",
  "0046_conference_booking_cancellation",
  "0047_ancient_may_parker",
  "0048_many_wasp",
  "0049_field_trip_decline",
  "0050_notification_outbound_deliveries",
  "0051_church_onboarding_requests",
  "0052_family_recruitment_relationship",
  "0053_institutional_graduation_closeout",
  "0054_academic_credential_delivery",
  "0055_academic_credential_release_authorizations",
  "0056_steep_lenny_balinger",
  "0057_curriculum_annual_adoptions",
  "0058_finance_invoices",
  "0059_church_evidence_statuses",
];

export function assessFullFlowMigrationReadiness(input) {
  const { project, branch, applied, lastTimestamp, journal, types, columns, tables,
    authorizationColumns = [], authorizationIndexes = [], authorizationConstraints = [],
    localCopyColumns = [], localCopyIndexes = [], localCopyConstraints = [],
    guardianDefaults = [], familyStartColumns = [], familyStartIndexes = [],
    consentColumns = [], consentIndexes = [], safetyQualificationKeys = [],
    conferenceBookingIndexes = [], p0SafetyColumns = [], p0SafetyIndexes = [],
    onboardingColumns = [], onboardingIndexes = [], outboundIndexes = [],
    relationshipColumns = [], futureIndexes = [], cohortColumns = [], cohortConstraints = [],
    lateColumns = [], lateIndexes = [], lateForeignKeys = [], latePrimaryKeys = [],
    churchStatusConstraints = [] } = input;
  const issues = [];
  // A previously reviewed 0032-0038 sequence is already applied on the
  // dedicated branch. Before applying each staged migration, verify that exact
  // committed base and that no staged artifact is partially present.
  const stagedEntries = journal.entries.slice(39);
  const includes0039 = stagedEntries.length >= 1 && stagedEntries.length <= stagedTags.length &&
    stagedEntries.every((entry, idx) => entry.tag === stagedTags[idx]);
  if (includes0039) {
    const found = new Set(tables.map(row => row.table_name));
    const enumValues = new Set(types.map(row => row.typname + "." + row.enumlabel));
    const cols = new Map(columns.map(row => [row.table_name + "." + row.column_name, row]));
    const priorTables = ["site_publications", "program_publications", "public_admissions_interests"];
    const priorEnums = ["program_type.summer_program",
      "program_type.after_school_enrichment", "activity_season_status.draft"];
    if (project !== "sweet-hall-62441909" || branch !== "br-proud-pine-arfju8h2")
      issues.push("Wrong Neon project or branch");
    if (!priorTables.every(name => found.has(name)) ||
        !priorEnums.every(name => enumValues.has(name)) ||
        cols.get("programs.credit_issuing_organization_id")?.is_nullable !== "YES" ||
        !["activity_seasons.metadata", "activity_registrations.metadata"].every(name => cols.has(name)))
      issues.push("0032-0038 database prerequisites do not match the reviewed FullFlow state");
    const when = idx => String(journal.entries[idx]?.when);
    const hasAll = (...names) => names.every(name => found.has(name));
    const lacksAll = (...names) => names.every(name => !found.has(name));
    const pre0039 = applied === 39 && String(lastTimestamp) === when(38) &&
      lacksAll("program_site_authorizations", "site_local_content_versions",
        "public_family_start_requests", "student_access_consents");
    const post0039 = applied === 40 && String(lastTimestamp) === when(39) &&
      hasAll("program_site_authorizations") &&
      lacksAll("site_local_content_versions", "public_family_start_requests", "student_access_consents");
    const post0040 = applied === 41 && String(lastTimestamp) === when(40) &&
      hasAll("program_site_authorizations", "site_local_content_versions") &&
      lacksAll("public_family_start_requests", "student_access_consents");
    const post0041 = applied === 42 && String(lastTimestamp) === when(41) &&
      hasAll("program_site_authorizations", "site_local_content_versions") &&
      lacksAll("public_family_start_requests", "student_access_consents");
    const post0042 = applied === 43 && String(lastTimestamp) === when(42) &&
      hasAll("program_site_authorizations", "site_local_content_versions", "public_family_start_requests") &&
      !found.has("student_access_consents");
    const post0043 = applied === 44 && String(lastTimestamp) === when(43) &&
      hasAll("program_site_authorizations", "site_local_content_versions",
        "public_family_start_requests", "student_access_consents");
    const post0044 = applied === 45 && String(lastTimestamp) === when(44) &&
      hasAll("program_site_authorizations", "site_local_content_versions",
        "public_family_start_requests", "student_access_consents");
    const post0045 = applied === 46 && String(lastTimestamp) === when(45) &&
      hasAll("program_site_authorizations", "site_local_content_versions",
        "public_family_start_requests", "student_access_consents");
    const post0046 = applied === 47 && String(lastTimestamp) === when(46) &&
      hasAll("program_site_authorizations", "site_local_content_versions",
        "public_family_start_requests", "student_access_consents");
    const post0047 = applied === 48 && String(lastTimestamp) === when(47) &&
      hasAll("program_site_authorizations", "site_local_content_versions",
        "public_family_start_requests", "student_access_consents");
    const post0048 = applied === 49 && String(lastTimestamp) === when(48) &&
      hasAll("program_site_authorizations", "site_local_content_versions",
        "public_family_start_requests", "student_access_consents");
    const declinedEnum = enumValues.has("field_trip_participant_status.declined");
    const outboundTable = found.has("notification_outbound_deliveries");
    const onboardingTable = found.has("church_onboarding_requests");
    const post0049 = applied === 50 && String(lastTimestamp) === when(49) &&
      declinedEnum && !outboundTable && !onboardingTable;
    const post0050 = applied === 51 && String(lastTimestamp) === when(50) &&
      declinedEnum && outboundTable && !onboardingTable;
    const post0051 = applied === 52 && String(lastTimestamp) === when(51) &&
      declinedEnum && outboundTable && onboardingTable;
    const laterLedgerMatch=(count,idx)=>applied===count &&
      String(lastTimestamp)===when(idx) && declinedEnum && outboundTable && onboardingTable;
    const post0052=laterLedgerMatch(53,52);
    const post0053=laterLedgerMatch(54,53);
    const post0054=laterLedgerMatch(55,54);
    const post0055=laterLedgerMatch(56,55);
    const post0056=laterLedgerMatch(57,56);
    const post0057=laterLedgerMatch(58,57);
    const post0058=laterLedgerMatch(59,58);
    const post0059=laterLedgerMatch(60,59);
    const stage = pre0039 ? 39 : post0039 ? 40 : post0040 ? 41 : post0041 ? 42 :
      post0042 ? 43 : post0043 ? 44 : post0044 ? 45 : post0045 ? 46 :
      post0046 ? 47 : post0047 ? 48 : post0048 ? 49 :
      post0049 ? 50 : post0050 ? 51 : post0051 ? 52 :
      post0052 ? 53 : post0053 ? 54 : post0054 ? 55 :
      post0055 ? 56 : post0056 ? 57 : post0057 ? 58 :
      post0058 ? 59 : post0059 ? 60 : 0;
    if (!stage)
      issues.push("0039-0059 migration ledger/table state is inconsistent or unexpected");
    if (stage) {
      if ((stage >= 50) !== declinedEnum)
        issues.push("0049 declined participant status disagrees with migration ledger");
      if ((stage >= 51) !== outboundTable)
        issues.push("0050 notification delivery table disagrees with migration ledger");
      if ((stage >= 52) !== onboardingTable)
        issues.push("0051 church onboarding table disagrees with migration ledger");
      const outboundIndexSet = new Set(outboundIndexes.map(row => row.indexname));
      const outboundRequired = ["notification_outbound_recipient_channel_uq", "notification_outbound_status_retry_idx"];
      if (stage >= 51 && outboundRequired.some(name => !outboundIndexSet.has(name)))
        issues.push("0050 notification delivery indexes missing");
      if (stage < 51 && outboundRequired.some(name => outboundIndexSet.has(name)))
        issues.push("0050 notification delivery indexes present before migration");
      const onboardingIndexSet = new Set(onboardingIndexes.map(row => row.indexname));
      const onboardingRequired = ["church_onboarding_requests_status_idx", "church_onboarding_requests_contact_idx"];
      if (stage >= 52 && onboardingRequired.some(name => !onboardingIndexSet.has(name)))
        issues.push("0051 church onboarding indexes missing");
      if (stage < 52 && onboardingRequired.some(name => onboardingIndexSet.has(name)))
        issues.push("0051 church onboarding indexes present before migration");
      const onboardingColumnSet = new Set(onboardingColumns.map(row => row.column_name));
      const onboardingRequiredColumns = ["id","church_name","church_slug","site_name","site_slug",
        "timezone","leader_title","contact_email","first_name","last_name","status",
        "authority_document_id","verified_by_person_id","approved_by_person_id",
        "church_id","site_id","invitation_grant_id","created_at","updated_at"];
      if (stage >= 52 && onboardingRequiredColumns.some(name => !onboardingColumnSet.has(name)))
        issues.push("0051 church onboarding columns missing");
      if (stage < 52 && onboardingColumnSet.size)
        issues.push("0051 church onboarding columns present before migration");
    }
    if (stage >= 40) {
      const actualColumns = new Set(authorizationColumns.map(row => row.column_name));
      const requiredColumns = [
        "id", "program_id", "site_id", "host_organization_id",
        "institution_organization_id", "version", "status", "services",
        "requested_by_person_id", "requested_at", "evidence_document_id",
        "effective_from", "effective_through", "reviewed_by_person_id",
        "reviewed_at", "review_reason", "revoked_by_person_id",
        "revoked_at", "revocation_reason", "created_at", "updated_at",
      ];
      const missingColumns = requiredColumns.filter(col => !actualColumns.has(col));
      if (missingColumns.length)
        issues.push("0039 authorization table columns missing: " + missingColumns.join(", "));
      const actualIndexes = new Set(authorizationIndexes.map(row => row.indexname));
      for (const name of ["program_site_authorization_version_uq", "program_site_authorization_current_uq"]) {
        if (!actualIndexes.has(name)) issues.push("0039 authorization index missing: " + name);
      }
      const actualConstraints = new Set(authorizationConstraints.map(row => row.conname));
      for (const name of [
        "program_site_authorization_status_ck", "program_site_authorization_review_ck",
        "program_site_authorization_revoked_ck", "program_site_authorization_distinct_review_ck",
        "program_site_authorization_services_ck",
      ]) {
        if (!actualConstraints.has(name)) issues.push("0039 authorization constraint missing: " + name);
      }
    }
    if (stage >= 41) {
      const columns = new Set(localCopyColumns.map(row => row.column_name));
      for (const name of [
        "id", "site_id", "revision", "status", "content", "flagged_fields",
        "created_by_person_id", "restored_from_revision", "created_at",
      ]) {
        if (!columns.has(name)) issues.push("0040 Site-local content column missing: " + name);
      }
      const indexes = new Set(localCopyIndexes.map(row => row.indexname));
      for (const name of ["site_local_content_site_revision_uq", "site_local_content_site_status_idx"]) {
        if (!indexes.has(name)) issues.push("0040 Site-local content index missing: " + name);
      }
      const constraints = new Set(localCopyConstraints.map(row => row.conname));
      for (const name of [
        "site_local_content_positive_revision_ck", "site_local_content_status_ck",
        "site_local_content_document_ck", "site_local_content_flagged_ck",
      ]) {
        if (!constraints.has(name)) issues.push("0040 Site-local content constraint missing: " + name);
      }
    }
    // 0041 flips pending-guardian capability defaults to false; they must not
    // already be false before 0041 and must be false once it has been applied.
    const guardianDefaultColumns = ["can_view_academics", "can_manage_enrollment",
      "can_submit_attendance_excuse"];
    const defaults = new Map(guardianDefaults.map(row => [row.column_name, String(row.column_default)]));
    if (stage >= 42) {
      for (const name of guardianDefaultColumns) {
        if (defaults.get(name) !== "false")
          issues.push("0041 guardian access default not applied: " + name);
      }
    } else if (stage) {
      for (const name of guardianDefaultColumns) {
        if (defaults.get(name) === "false")
          issues.push("0041 guardian access default present before its migration: " + name);
      }
    }
    if (stage >= 43) {
      const actual = new Set(familyStartColumns.map(row => row.column_name));
      for (const name of [
        "id", "site_id", "program_id", "email_normalized", "adult_first_name",
        "adult_last_name", "token_hash", "expires_at", "consumed_at", "created_at",
      ]) {
        if (!actual.has(name)) issues.push("0042 family start request column missing: " + name);
      }
      const indexes = new Set(familyStartIndexes.map(row => row.indexname));
      for (const name of ["public_family_starts_token_uq", "public_family_starts_expiry_idx",
        "public_family_starts_school_idx"]) {
        if (!indexes.has(name)) issues.push("0042 family start request index missing: " + name);
      }
    }
    if (stage >= 44) {
      const actual = new Set(consentColumns.map(row => row.column_name));
      for (const name of [
        "id", "application_id", "student_profile_id", "guardian_person_id",
        "program_id", "site_id", "student_email", "consent_statement",
        "signed_at", "reviewed_by_person_id", "reviewed_at", "status",
        "created_at", "updated_at",
      ]) {
        if (!actual.has(name)) issues.push("0043 student access consent column missing: " + name);
      }
      const indexes = new Set(consentIndexes.map(row => row.indexname));
      for (const name of ["student_access_consent_application_uq", "student_access_consent_reviewer_idx"]) {
        if (!indexes.has(name)) issues.push("0043 student access consent index missing: " + name);
      }
    }
    const operatingEnums = ["school_configuration_status.approved", "school_configuration_status.suspended"];
    if (stage >= 45) {
      for (const name of operatingEnums) {
        if (!enumValues.has(name)) issues.push("0044 operating-approval enum value missing: " + name);
      }
    } else if (stage) {
      for (const name of operatingEnums) {
        if (enumValues.has(name)) issues.push("0044 operating-approval enum value present before its migration: " + name);
      }
    }
    const seededSafetyKeys = new Set(safetyQualificationKeys.map(row => row.key));
    if (stage >= 46) {
      for (const key of ["onsite_child_safety_screening", "onsite_safeguarding_training"]) {
        if (!seededSafetyKeys.has(key)) issues.push("0045 onsite safety qualification definition missing: " + key);
      }
    } else if (stage) {
      for (const key of seededSafetyKeys) {
        issues.push("0045 onsite safety qualification definition present before its migration: " + key);
      }
    }
    // 0046 adds conference_booking_status.cancelled and recreates
    // conference_slot_booking_uq as a partial unique index that excludes
    // cancelled bookings; the enum value must not exist before stage 47.
    if (stage >= 47) {
      if (!enumValues.has("conference_booking_status.cancelled"))
        issues.push("0046 conference booking cancellation enum value missing");
      const slotIndex = conferenceBookingIndexes.find(row => row.indexname === "conference_slot_booking_uq");
      if (!slotIndex || !String(slotIndex.indexdef ?? "").includes("WHERE"))
        issues.push("0046 partial unique index missing: conference_slot_booking_uq");
    } else if (stage) {
      if (enumValues.has("conference_booking_status.cancelled"))
        issues.push("0046 conference booking cancellation enum value present before its migration");
    }
    // 0047 is additive only: restricted safeguarding records, verified pickup
    // records, their evidence/idempotency fields, foreign keys and indexes.
    const p0SafetyTables = [
      "pickup_authorizations", "pickup_custody_holds", "pickup_release_events",
      "safeguarding_case_assignments", "safeguarding_concerns",
      "safeguarding_external_reports", "safeguarding_site_policies",
      "safeguarding_site_responders",
    ];
    const p0SafetyRequiredColumns = [
      "guardian_relationships.can_manage_pickup", "incident_evidence.idempotency_key",
    ];
    const p0SafetyRequiredIndexes = [
      "pickup_authorization_source_key_uq", "pickup_authorization_roster_idx",
      "pickup_authorization_person_idx", "pickup_authorization_household_idx",
      "pickup_custody_hold_source_key_uq", "pickup_custody_hold_roster_idx",
      "pickup_custody_hold_household_idx", "pickup_release_event_source_key_uq",
      "pickup_release_event_roster_idx", "pickup_release_event_attendance_idx",
      "pickup_release_event_site_time_idx", "safeguarding_case_assignment_uq",
      "safeguarding_case_assignment_person_idx", "safeguarding_case_assignment_incident_idx",
      "safeguarding_concern_reporter_idempotency_uq", "safeguarding_concern_student_idx",
      "safeguarding_external_report_idempotency_uq", "safeguarding_external_report_incident_idx",
      "safeguarding_site_policy_site_uq", "safeguarding_site_responder_role_uq",
      "safeguarding_site_responder_person_idx", "incident_evidence_actor_idempotency_uq",
    ];
    const actualP0Columns = new Set(p0SafetyColumns.map(row => row.table_name + "." + row.column_name));
    const actualP0Indexes = new Set(p0SafetyIndexes.map(row => row.indexname));
    if (stage >= 48) {
      for (const name of p0SafetyTables) {
        if (!found.has(name)) issues.push("0047 safeguarding/pickup table missing: " + name);
      }
      for (const name of p0SafetyRequiredColumns) {
        if (!actualP0Columns.has(name)) issues.push("0047 safeguarding/pickup column missing: " + name);
      }
      for (const name of p0SafetyRequiredIndexes) {
        if (!actualP0Indexes.has(name)) issues.push("0047 safeguarding/pickup index missing: " + name);
      }
    } else if (stage) {
      for (const name of p0SafetyTables) {
        if (found.has(name)) issues.push("0047 safeguarding/pickup table present before migration: " + name);
      }
      for (const name of p0SafetyRequiredColumns) {
        if (actualP0Columns.has(name)) issues.push("0047 safeguarding/pickup column present before migration: " + name);
      }
      for (const name of actualP0Indexes) {
        issues.push("0047 safeguarding/pickup index present before migration: " + name);
      }
    }
    // 0048 adds the reversible CAN suspension fields to the authorization
    // ledger plus the mirroring suspended consistency CHECK; the columns and
    // constraint must not exist before and must exist after it is applied.
    const suspensionColumns = ["suspended_at", "suspended_by_person_id", "suspension_reason"];
    const actualAuthColumns = new Set(authorizationColumns.map(row => row.column_name));
    const actualAuthConstraints = new Set(authorizationConstraints.map(row => row.conname));
    if (stage >= 49) {
      for (const name of suspensionColumns) {
        if (!actualAuthColumns.has(name)) issues.push("0048 suspension column missing: " + name);
      }
      if (!actualAuthConstraints.has("program_site_authorization_suspended_ck"))
        issues.push("0048 suspension constraint missing: program_site_authorization_suspended_ck");
    } else if (stage) {
      for (const name of suspensionColumns) {
        if (actualAuthColumns.has(name)) issues.push("0048 suspension column present before migration: " + name);
      }
      if (actualAuthConstraints.has("program_site_authorization_suspended_ck"))
        issues.push("0048 suspension constraint present before migration: program_site_authorization_suspended_ck");
    }
    if(stage) {
      issues.push(...assessPost0051MigrationArtifacts({
        stage,tables,relationshipColumns,futureIndexes,cohortColumns,cohortConstraints,
      }));
      issues.push(...assessPost0056MigrationArtifacts({
        stage,tables,lateColumns,lateIndexes,lateForeignKeys,latePrimaryKeys,churchStatusConstraints,
      }));
    }
    const stagedPending = stagedEntries.map(entry => entry.tag);
    const pendingMigrations = stage ? stagedPending.slice(stage - 39) : [];
    return {
      ready: issues.length === 0, issues, appliedMigrations: applied,
      pendingMigrations,
      target: "fullflow-e2e-20261022",
      status: issues.length ? "HOLD_REVIEW_DRIFT" :
        pendingMigrations.length ? "PRECONDITIONS_MATCH_NOT_APPLIED" : "UP_TO_DATE",
    };
  }
  if (project !== "sweet-hall-62441909" || branch !== "br-proud-pine-arfju8h2")
    issues.push("Wrong Neon project or branch");
  const expected = journal.entries.slice(32).map(entry => entry.tag);
  if (expected.join("|") !== pendingTags.join("|"))
    issues.push("Committed migration journal no longer matches the reviewed 0032–0038 sequence");
  if (applied !== 32 || String(lastTimestamp) !== String(journal.entries[31]?.when))
    issues.push("Migration ledger differs from the reviewed 0031 starting state");
  const typeSet = new Set(types.map(row => row.typname + "." + row.enumlabel));
  for (const entry of ["program_type.summer_program","program_type.after_school_enrichment","activity_season_status.draft"])
    if (typeSet.has(entry)) issues.push("Pending enum value already exists: " + entry);
  const col = new Map(columns.map(row => [row.table_name + "." + row.column_name, row]));
  if (col.get("programs.credit_issuing_organization_id")?.is_nullable !== "NO")
    issues.push("Existing program credit issuer nullability is not the reviewed pre-migration value");
  for (const key of ["activity_seasons.metadata", "activity_registrations.metadata"])
    if (col.has(key)) issues.push("Pending enrichment metadata column already exists: " + key);
  const tableSet = new Set(tables.map(row => row.table_name));
  for (const table of ["site_publications", "program_publications", "public_admissions_interests"])
    if (tableSet.has(table)) issues.push("Pending publication/intake table already exists: " + table);
  return { ready: issues.length === 0, issues,
    appliedMigrations: applied, pendingMigrations: pendingTags, target: "fullflow-e2e-20261022",
    // Being ready for migration is NOT approval to apply the migration.
    status: issues.length ? "HOLD_REVIEW_DRIFT" : "PRECONDITIONS_MATCH_NOT_APPLIED" };
}

async function main() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  if (process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" || process.env.NODE_ENV === "production")
    throw new Error("Set CAN_TEST_DB_WRITES_ENABLED=true in a nonproduction environment");
  const url = process.env.TEST_DATABASE_URL;
  await verifyFullFlowNeonBranch(url);
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url),"utf8"));
  if (journal.entries.length < 39 || journal.entries.length > 39 + stagedTags.length)
    throw new Error("Unexpected migration journal length; re-review the pending migration set");
  const query = neon(url);
  const [[identity],[ledger],types,columns,tables,
    authorizationColumns,authorizationIndexes,authorizationConstraints,
    localCopyColumns,localCopyIndexes,localCopyConstraints,
    guardianDefaults,familyStartColumns,familyStartIndexes,
    consentColumns,consentIndexes,safetyQualificationKeys,conferenceBookingIndexes,
    p0SafetyColumns,p0SafetyIndexes,
    onboardingColumns,onboardingIndexes,outboundIndexes,
    relationshipColumns,futureIndexes,cohortColumns,cohortConstraints,
    lateColumns,lateIndexes,lateForeignKeys,latePrimaryKeys,churchStatusConstraints] = await Promise.all([
    query`SELECT current_setting('neon.project_id', true) AS project,
                 current_setting('neon.branch_id', true) AS branch`,
    query`SELECT count(*)::int AS applied, max(created_at) AS last_timestamp FROM drizzle.__drizzle_migrations`,
    query`SELECT t.typname, e.enumlabel FROM pg_type t
          JOIN pg_enum e ON e.enumtypid=t.oid
          WHERE t.typname IN ('program_type','activity_season_status','school_configuration_status','conference_booking_status','field_trip_participant_status')`,
    query`SELECT table_name, column_name, is_nullable FROM information_schema.columns
          WHERE table_schema='public' AND
           ((table_name='programs' AND column_name='credit_issuing_organization_id') OR
            (table_name IN ('activity_seasons','activity_registrations') AND column_name='metadata'))`,
    query`SELECT table_name FROM information_schema.tables
          WHERE table_schema='public' AND
          table_name IN ('site_publications','program_publications','public_admissions_interests','program_site_authorizations','site_local_content_versions','public_family_start_requests','student_access_consents','pickup_authorizations','pickup_custody_holds','pickup_release_events','safeguarding_case_assignments','safeguarding_concerns','safeguarding_external_reports','safeguarding_site_policies','safeguarding_site_responders',
            'notification_outbound_deliveries','church_onboarding_requests',
             'graduation_requirement_sets','graduation_decisions','diploma_issuances',
             'academic_credential_deliveries','academic_credential_release_authorizations',
              'curriculum_annual_adoptions','finance_invoices','finance_payment_attempts',
              'finance_provider_events','finance_receipts')`,
    query`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='program_site_authorizations'`,
    query`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='program_site_authorizations'`,
    query`SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='program_site_authorizations'`,
    query`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='site_local_content_versions'`,
    query`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='site_local_content_versions'`,
    query`SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='site_local_content_versions'`,
    query`SELECT column_name, column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='guardian_relationships' AND
      column_name IN ('can_view_academics','can_manage_enrollment','can_submit_attendance_excuse')`,
    query`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='public_family_start_requests'`,
    query`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='public_family_start_requests'`,
    query`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='student_access_consents'`,
    query`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='student_access_consents'`,
    query`SELECT key FROM "public"."qualification_definitions"
      WHERE key IN ('onsite_child_safety_screening','onsite_safeguarding_training')`,
    query`SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename='conference_bookings' AND
      indexname='conference_slot_booking_uq'`,
    query`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND
      ((table_name='guardian_relationships' AND column_name='can_manage_pickup') OR
       (table_name='incident_evidence' AND column_name='idempotency_key'))`,
    query`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND
      (tablename IN ('pickup_authorizations','pickup_custody_holds','pickup_release_events',
        'safeguarding_case_assignments','safeguarding_concerns','safeguarding_external_reports',
        'safeguarding_site_policies','safeguarding_site_responders') OR
       (tablename='incident_evidence' AND indexname='incident_evidence_actor_idempotency_uq'))`,
    query`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='church_onboarding_requests'`,
    query`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='church_onboarding_requests'`,
    query`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='notification_outbound_deliveries'`,
    query`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='public_admissions_interests' AND
      column_name IN ('contact_consent_at','source','invitation_batch_id','invitation_recipient_key','family_start_request_id')`,
    query`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND
      indexname IN ('public_admissions_interests_invited_recipient_uq',
        'public_admissions_interests_family_start_idx','graduation_decision_student_idx',
        'academic_delivery_issuer_idx','academic_delivery_status_idx',
        'academic_release_issuer_idx','academic_release_recipient_idx',
        'graduation_requirement_superseded_once_uq','graduation_requirement_cohort_lookup_idx')`,
    query`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='graduation_requirement_sets' AND
      column_name IN ('cohort_start','cohort_end','supersedes_requirement_set_id','applicability_reason')`,
    query`SELECT conname FROM pg_constraint
      WHERE conrelid=to_regclass('public.graduation_requirement_sets') AND
      conname IN ('graduation_cohort_bounds_ck','graduation_supersession_not_self_ck',
       'graduation_requirement_sets_supersedes_requirement_set_id_graduation_requirement_sets_id_fk')`,
    query`SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN
       ('curriculum_annual_adoptions','finance_invoices','finance_payment_attempts',
        'finance_provider_events','finance_receipts')`,
    query`SELECT tablename,indexname,indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename IN
       ('curriculum_annual_adoptions','finance_invoices','finance_payment_attempts',
        'finance_provider_events','finance_receipts')`,
    query`SELECT source.relname AS table_name, att.attname AS column_name,
       target.relname AS referenced_table, c.confdeltype AS on_delete
      FROM pg_constraint c
      JOIN pg_class source ON source.oid=c.conrelid
      JOIN pg_class target ON target.oid=c.confrelid
      JOIN pg_attribute att ON att.attrelid=source.oid AND att.attnum=c.conkey[1]
      WHERE c.contype='f' AND array_length(c.conkey,1)=1
       AND source.relnamespace='public'::regnamespace
       AND source.relname IN
       ('curriculum_annual_adoptions','finance_invoices','finance_payment_attempts',
        'finance_provider_events','finance_receipts')`,
    query`SELECT source.relname AS table_name, att.attname AS column_name
      FROM pg_constraint c
      JOIN pg_class source ON source.oid=c.conrelid
      JOIN pg_attribute att ON att.attrelid=source.oid AND att.attnum=c.conkey[1]
      WHERE c.contype='p' AND array_length(c.conkey,1)=1
       AND source.relnamespace='public'::regnamespace
       AND source.relname IN
       ('curriculum_annual_adoptions','finance_invoices','finance_payment_attempts',
        'finance_provider_events','finance_receipts')`,
    query`SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=to_regclass('public.church_onboarding_requests')
       AND conname='church_onboarding_request_status_ck'`
  ]);
  const review = assessFullFlowMigrationReadiness({
    ...identity, ...ledger, lastTimestamp: ledger.last_timestamp, journal, types, columns, tables,
    authorizationColumns, authorizationIndexes, authorizationConstraints,
    localCopyColumns, localCopyIndexes, localCopyConstraints,
    guardianDefaults, familyStartColumns, familyStartIndexes,
    consentColumns, consentIndexes, safetyQualificationKeys, conferenceBookingIndexes,
    p0SafetyColumns, p0SafetyIndexes,
    onboardingColumns, onboardingIndexes, outboundIndexes,
    relationshipColumns, futureIndexes, cohortColumns, cohortConstraints,
    lateColumns, lateIndexes, lateForeignKeys, latePrimaryKeys, churchStatusConstraints,
  });
  process.stdout.write(JSON.stringify(review,null,2)+"\n");
  if (!review.ready) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "Read-only migration preflight failed");
    process.exitCode = 1;
  });
}
