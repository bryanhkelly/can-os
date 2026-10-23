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
  const { project, branch, applied, lastTimestamp, journal, types, columns, tables } = input;
  const issues = [];
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
  if (journal.entries.length !== 39) throw new Error("Unexpected migration journal length; re-review the pending migration set");
  const query = neon(url);
  const [[identity],[ledger],types,columns,tables] = await Promise.all([
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
          table_name IN ('site_publications','program_publications','public_admissions_interests')`,
  ]);
  const review = assessFullFlowMigrationReadiness({ ...identity, ...ledger, journal, types, columns, tables });
  process.stdout.write(JSON.stringify(review,null,2)+"\n");
  if (!review.ready) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "Read-only migration preflight failed");
    process.exitCode = 1;
  });
}
