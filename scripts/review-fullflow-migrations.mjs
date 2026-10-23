import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { verifyFullFlowNeonBranch } from "./verify-fullflow-neon-branch.mjs";

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

export function assessFullFlowMigrationReadiness(input) {
  const { project, branch, applied, lastTimestamp, journal, types, columns, tables,
    authorizationColumns = [], authorizationIndexes = [], authorizationConstraints = [] } = input;
  const issues = [];
  // A previously reviewed 0032-0038 sequence is already applied on the
  // dedicated branch. Before applying 0039, verify that exact committed base
  // and that the new operating-authorization table is not partially present.
  if (journal.entries.length === 40 &&
      journal.entries[39]?.tag === "0039_program_site_authorizations") {
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
    const pre0039 = applied === 39 &&
      String(lastTimestamp) === String(journal.entries[38].when) &&
      !found.has("program_site_authorizations");
    const post0039 = applied === 40 &&
      String(lastTimestamp) === String(journal.entries[39].when) &&
      found.has("program_site_authorizations");
    if (!pre0039 && !post0039)
      issues.push("0039 migration ledger/table state is inconsistent or unexpected");
    if (post0039) {
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
    return {
      ready: issues.length === 0, issues, appliedMigrations: applied,
      pendingMigrations: post0039 ? [] : ["0039_program_site_authorizations"],
      target: "fullflow-e2e-20261022",
      status: issues.length ? "HOLD_REVIEW_DRIFT" :
        post0039 ? "UP_TO_DATE" : "PRECONDITIONS_MATCH_NOT_APPLIED",
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
  if (![39,40].includes(journal.entries.length))
    throw new Error("Unexpected migration journal length; re-review the pending migration set");
  const query = neon(url);
  const [[identity],[ledger],types,columns,tables,
    authorizationColumns,authorizationIndexes,authorizationConstraints] = await Promise.all([
    query`SELECT current_setting('neon.project_id', true) AS project,
                 current_setting('neon.branch_id', true) AS branch`,
    query`SELECT count(*)::int AS applied, max(created_at) AS last_timestamp FROM drizzle.__drizzle_migrations`,
    query`SELECT t.typname, e.enumlabel FROM pg_type t
          JOIN pg_enum e ON e.enumtypid=t.oid
          WHERE t.typname IN ('program_type','activity_season_status')`,
    query`SELECT table_name, column_name, is_nullable FROM information_schema.columns
          WHERE table_schema='public' AND
           ((table_name='programs' AND column_name='credit_issuing_organization_id') OR
            (table_name IN ('activity_seasons','activity_registrations') AND column_name='metadata'))`,
    query`SELECT table_name FROM information_schema.tables
          WHERE table_schema='public' AND
          table_name IN ('site_publications','program_publications','public_admissions_interests','program_site_authorizations')`,
    query`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='program_site_authorizations'`,
    query`SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='program_site_authorizations'`,
    query`SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='program_site_authorizations'`,
  ]);
  const review = assessFullFlowMigrationReadiness({
    ...identity, ...ledger, journal, types, columns, tables,
    authorizationColumns, authorizationIndexes, authorizationConstraints,
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
