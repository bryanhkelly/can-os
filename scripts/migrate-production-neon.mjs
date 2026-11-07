import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const projectId = "sweet-hall-62441909";
const branchId = "br-restless-sea-ar9ooo55";
const expectedPendingTag = "0076_curly_makkari";
const preflightOnly = process.argv.includes("--preflight");
if (process.argv.slice(2).some(argument => argument !== "--preflight")) {
  throw new Error("Unrecognized argument. Use --preflight or no additional arguments.");
}

if (existsSync(".env.local")) loadEnvFile(".env.local");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const entries = journal.entries;
const sql = neon(databaseUrl);

async function readLedger() {
  const [identity] = await sql.query(`
    select current_setting('neon.project_id', true) as project_id,
           current_setting('neon.branch_id', true) as branch_id
  `);
  if (identity?.project_id !== projectId || identity?.branch_id !== branchId) {
    throw new Error("Refusing migration: DATABASE_URL is not the attested production branch.");
  }

  const migrations = await sql.query(`
    select created_at::text as created_at, hash
    from drizzle.__drizzle_migrations
    order by created_at
  `);
  return new Map(migrations.map(row => [String(row.created_at), row]));
}

const byTimestamp = await readLedger();
const pending = entries.filter(entry => !byTimestamp.has(String(entry.when)));
async function verifyTargetApplied(ledger) {
  const target = entries.find(entry => entry.tag === expectedPendingTag);
  const row = target && ledger.get(String(target.when));
  if (!target || !row) throw new Error(`Postflight failed: ${expectedPendingTag} is not in the ledger.`);
  const contents = readFileSync(`drizzle/${target.tag}.sql`, "utf8").replace(/\r\n/g, "\n");
  if (String(row.hash) !== createHash("sha256").update(contents).digest("hex")) {
    throw new Error(`Postflight failed: ${expectedPendingTag} hash mismatch.`);
  }
  const [objects] = await sql.query(`
    select to_regclass('public.school_setup_signups') is not null as signup_table,
           to_regclass('public.school_setup_signup_account_uq') is not null as account_index,
           to_regclass('public.school_setup_signup_org_uq') is not null as organization_index,
           to_regclass('public.school_setup_signup_site_uq') is not null as site_index,
           to_regclass('public.school_setup_signup_expiry_idx') is not null as expiry_index,
           (select count(*) = 3 from information_schema.table_constraints
             where table_schema = 'public' and table_name = 'school_setup_signups'
               and constraint_type = 'FOREIGN KEY') as foreign_keys,
           (select count(*) = 11 from information_schema.columns
             where table_schema = 'public' and table_name = 'school_setup_signups') as columns
  `);
  if (!objects?.signup_table || !objects.account_index || !objects.organization_index ||
      !objects.site_index || !objects.expiry_index || !objects.foreign_keys || !objects.columns) {
    throw new Error(`Postflight failed: ${expectedPendingTag} tables are absent.`);
  }
}

if (pending.length === 0) {
  await verifyTargetApplied(byTimestamp);
  console.log(`${expectedPendingTag} is already applied and verified on production.`);
  process.exit(0);
}
if (pending.length !== 1 || pending[0]?.tag !== expectedPendingTag) {
  throw new Error(`Refusing migration: expected only ${expectedPendingTag} pending.`);
}

const stagedStart = 52;
const targetIndex = entries.findIndex(entry => entry.tag === expectedPendingTag);
for (const entry of entries.slice(stagedStart, targetIndex)) {
  const row = byTimestamp.get(String(entry.when));
  if (!row) throw new Error(`Refusing migration: applied ledger row missing for ${entry.tag}.`);
  const contents = readFileSync(`drizzle/${entry.tag}.sql`, "utf8").replace(/\r\n/g, "\n");
  const hash = createHash("sha256").update(contents).digest("hex");
  if (String(row.hash) !== hash) {
    throw new Error(`Refusing migration: applied SQL hash mismatch for ${entry.tag}.`);
  }
}

const [objects] = await sql.query(`
    select to_regclass('public.teacher_professional_profiles') is not null as profiles,
           to_regclass('public.room_coverage_schedules') is not null as coverage,
           to_regclass('public.room_coverage_sections') is not null as coverage_sections,
           to_regclass('public.interest_events') is not null as interest_events,
           to_regclass('public.interest_event_registrations') is not null as interest_registrations,
           to_regclass('public.scheduled_reminders') is not null as scheduled_reminders,
           to_regclass('public.interest_event_email_deliveries') is not null as event_deliveries,
           to_regclass('public.launch_studio_drafts') is not null as launch_drafts,
           to_regclass('public.school_setup_signups') is not null as signup_table
  `);
if (!objects?.profiles || !objects.coverage || !objects.coverage_sections ||
    !objects.interest_events || !objects.interest_registrations || !objects.scheduled_reminders ||
    !objects.event_deliveries || !objects.launch_drafts) {
  throw new Error("Refusing migration: expected 0070-0075 production tables are absent.");
}
if (objects.signup_table) {
  throw new Error(`Refusing migration: ${expectedPendingTag} target table already exists.`);
}
console.log(`Verified production Neon branch ${branchId}; ${expectedPendingTag} is the only pending migration.`);
if (preflightOnly) {
  console.log("Preflight passed; no SQL applied.");
  process.exit(0);
}

const windows = process.platform === "win32";
const result = spawnSync(
  windows ? process.env.ComSpec ?? "cmd.exe" : "npm",
  windows ? ["/d", "/s", "/c", "npm run db:migrate"] : ["run", "db:migrate"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl, APP_ENV: "production", NODE_ENV: "production" },
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
await verifyTargetApplied(await readLedger());
console.log(`Postflight verified ${expectedPendingTag} on production.`);