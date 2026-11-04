import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const projectId = "sweet-hall-62441909";
const branchId = "br-restless-sea-ar9ooo55";
const expectedPendingTag = "0072_interest_events";

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
    select to_regclass('public.interest_events') is not null as interest_events,
           to_regclass('public.interest_event_registrations') is not null as interest_registrations
  `);
  if (!objects?.interest_events || !objects.interest_registrations) {
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
           to_regclass('public.interest_event_registrations') is not null as interest_registrations
  `);
if (!objects?.profiles || !objects.coverage || !objects.coverage_sections) {
  throw new Error("Refusing migration: expected 0070/0071 production tables are absent.");
}
if (objects.interest_events || objects.interest_registrations) {
  throw new Error("Refusing migration: 0072 target objects already exist.");
}
console.log(`Verified production Neon branch ${branchId}; applying ${expectedPendingTag}.`);

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