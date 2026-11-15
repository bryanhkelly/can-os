#!/usr/bin/env node
/**
 * Read-only production Neon / Drizzle migration evidence.
 * Never runs migrations, inserts records, changes RLS or loads test data.
 * Requires the exact Neon production database and the checked-out repository.
 *
 * CAN_PRODUCTION_SCHEMA_VALIDATION=1 DATABASE_URL="..." node scripts/acceptance/check-production-drizzle-parity.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const PROJECT = "sweet-hall-62441909";
const BRANCH = "br-restless-sea-ar9ooo55";
const start = 76;
const tip = 83;
const expectedAdded = new Map([
  [79, "public.access_session_signals"],
  [81, "public.access_account_favorite_sites"],
  [82, "public.access_account_signups"],
  [83, "public.access_site_contact_share_revisions"],
]);

if (process.env.CAN_PRODUCTION_SCHEMA_VALIDATION !== "1") {
  throw new Error("Refusing schema validation without CAN_PRODUCTION_SCHEMA_VALIDATION=1.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be explicitly provided for read-only validation.");
}

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const entries = journal.entries.filter(entry => entry.idx >= start && entry.idx <= tip);
assert.equal(entries.length, tip - start + 1, "Migration journal is incomplete.");

const snapshots = new Map();
for (const entry of entries) {
  const file = `drizzle/meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`;
  const snapshot = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(snapshot.version, "7", `Unexpected snapshot version: ${file}`);
  assert.equal(snapshot.dialect, "postgresql", `Unexpected dialect: ${file}`);
  const previous = snapshots.get(entry.idx - 1);
  if (previous) {
    assert.equal(snapshot.prevId, previous.id, `Broken snapshot predecessor chain: ${file}`);
    const added = Object.keys(snapshot.tables)
      .filter(key => !(key in previous.tables));
    assert.deepEqual(added, expectedAdded.has(entry.idx) ? [expectedAdded.get(entry.idx)] : [],
      `Unexpected modeled table change in ${file}`);
  }
  snapshots.set(entry.idx, snapshot);
}
const current = snapshots.get(tip);
assert.ok(current.tables["public.access_site_contact_share_revisions"], "Contact consent missing from snapshot tip.");
assert.ok(current.tables["public.access_account_signups"], "Personal CAN signup missing from snapshot tip.");
assert.equal(Object.keys(current.tables["public.access_sessions"].columns).length, 16,
  "Account session security columns missing from tip snapshot.");

const expectedRows = entries.filter(entry => entry.idx >= 79).map(entry => {
  const path = `drizzle/${entry.tag}.sql`;
  const bytes = readFileSync(path);
  return {
    created_at: entry.when,
    hash: createHash("sha256").update(bytes).digest("hex"),
    tag: entry.tag,
  };
});

const query = neon(process.env.DATABASE_URL);
const [identity] = await query`
  SELECT current_setting('neon.project_id',true) AS project_id,
         current_setting('neon.branch_id',true) AS branch_id,
         current_database() AS database_name,
         current_user AS database_user
`;
assert.equal(identity?.project_id, PROJECT, "Database project is not CAN OS production.");
assert.equal(identity?.branch_id, BRANCH, "DATABASE_URL does not target Neon production main.");
assert.equal(identity?.database_name, "neondb", "Unexpected database name.");

const recorded = await query`
  SELECT id,hash,created_at
  FROM drizzle.__drizzle_migrations
  WHERE created_at >= 1794690000000
  ORDER BY created_at
`;
assert.equal(recorded.length, expectedRows.length, "Applied migration ledger does not match repository.");
for (let i = 0; i < expectedRows.length; i++) {
  assert.equal(String(recorded[i].created_at), String(expectedRows[i].created_at),
    `Migration order mismatch: ${expectedRows[i].tag}`);
  assert.equal(recorded[i].hash, expectedRows[i].hash,
    `SQL hash mismatch: ${expectedRows[i].tag}`);
}

const [check] = await query`
 SELECT
   (SELECT count(*) FROM drizzle.__drizzle_migrations) AS migration_count,
   to_regclass('public.access_account_favorite_sites') IS NOT NULL AS favorites,
   to_regclass('public.access_account_signups') IS NOT NULL AS signups,
   to_regclass('public.access_site_contact_share_revisions') IS NOT NULL AS contact_consents,
   to_regclass('public.access_session_signals') IS NOT NULL AS session_signals,
   to_regclass('public.session_device_retention_state') IS NOT NULL AS device_retention,
   to_regclass('education_v30.site_device_policies') IS NOT NULL AS device_policies,
   to_regclass('education_v30.site_device_registrations') IS NOT NULL AS device_registrations,
   to_regclass('education_v30.noncredit_self_enrollment_releases') IS NOT NULL AS noncredit_releases,
   to_regclass('public.site_canonical_identity_links') IS NOT NULL AS site_identity_links,
   EXISTS (SELECT 1 FROM pg_indexes
     WHERE schemaname='education_v30' AND indexname='noncredit_self_enroll_provider_idx') AS provider_index,
   EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='access_account_favorite_sites'
       AND policyname='account_favorites_own_only') AS favorites_rls,
   EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='access_site_contact_share_revisions'
       AND policyname='account_contact_shares_own_only') AS consent_rls,
   EXISTS (SELECT 1 FROM pg_roles
     WHERE rolname='can_v30_site_identity_writer' AND NOT rolbypassrls AND NOT rolcanlogin) AS scoped_writer
`;
assert.equal(Number(check?.migration_count), 85, "Drizzle migration ledger must contain exactly 85 records.");
for (const [key, value] of Object.entries(check)) {
  if (key !== "migration_count") assert.equal(value, true, `Missing required production object: ${key}`);
}
console.log(JSON.stringify({
  result:"PASS",
  environment:"Neon can-os / main",
  project_id:identity.project_id,
  branch_id:identity.branch_id,
  role:identity.database_user,
  migrations:Number(check.migration_count),
  last_migration:expectedRows.at(-1).tag,
  tip_snapshot:"0083_snapshot.json",
  models:Object.keys(current.tables).length,
  note:"Read-only schema/ledger check; does NOT establish Cloudflare deployment, role-based browser acceptance or production rollback.",
},null,2));
