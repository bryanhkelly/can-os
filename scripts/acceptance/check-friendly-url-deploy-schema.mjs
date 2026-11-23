#!/usr/bin/env node
/**
 * Fail-closed, READ-ONLY release gate against the exact deployment DATABASE_URL.
 * Does not apply SQL or migrate production and never logs credentials, IDs or
 * application records. Run BEFORE deploying Cloudflare.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { assertFriendlyUrlDeployment } from "../lib/friendly-url-deploy-guards.mjs";

if (!process.env.DATABASE_URL)
  throw new Error("BLOCKED: deployment DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
// Production currently ends at 0099. Do not allow the 0105 Go Link schema
// alone to mask missing Reporting/Identity migrations from 0100 onward.
// Every new migration added to the release journal is included automatically.
const migrationEntries = journal.entries.filter(entry => entry.idx >= 100);
if (migrationEntries.length < 8 ||
    migrationEntries[0]?.idx !== 100 ||
    !migrationEntries.some(entry => entry.tag === "0105_site_go_links") ||
    !migrationEntries.some(entry => entry.tag === "0106_site_go_links_private_role_access") ||
    !migrationEntries.some(entry => entry.tag === "0107_site_go_link_capabilities") ||
    migrationEntries.some((entry, i) => entry.idx !== i + 100))
  throw new Error("BLOCKED: incomplete or out-of-order deployment migration journal");
const migrations = migrationEntries.map(entry => ({
  tag: entry.tag, when: entry.when,
  hash: createHash("sha256").update(
    readFileSync("drizzle/" + entry.tag + ".sql"),
  ).digest("hex"),
}));

const [identity] = await sql`
  SELECT current_setting('neon.project_id',true) AS project_id,
    current_setting('neon.branch_id',true) AS branch_id,
    current_database() AS database_name
`;
const [schema] = await sql`
  SELECT
    to_regclass('public.organizations') IS NOT NULL AS organizations,
    to_regclass('public.sites') IS NOT NULL AS sites,
    to_regclass('public.site_marketing_packages') IS NOT NULL AS marketing_packages,
    to_regclass('public.site_go_links') IS NOT NULL AS go_links,
    to_regclass('public.site_go_link_daily_visits') IS NOT NULL AS go_link_daily_visits
`;
const names = Object.keys(schema);
if (names.some(name => schema[name] !== true))
  throw new Error("BLOCKED: required migration tables missing: " + names.filter(name => !schema[name]).join(", "));

// Refer only to the new table after confirming it exists, to distinguish
// unapplied migrations from privilege errors or a missing database.
const [schemaChecks] = await sql`
  SELECT
    (SELECT relrowsecurity FROM pg_class
      WHERE oid=to_regclass('public.site_go_links')) AS go_link_rls,
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
      WHERE oid=to_regclass('public.site_go_link_daily_visits')) AS go_link_daily_visits_private,
    (SELECT relrowsecurity FROM pg_class
      WHERE oid=to_regclass('public.sites')) AS site_rls,
    (SELECT relrowsecurity FROM pg_class
      WHERE oid=to_regclass('public.organizations')) AS organization_rls,
    EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='site_go_links_code_uq' AND indexdef ILIKE '%UNIQUE INDEX%')
      AS unique_go_code,
    EXISTS(SELECT 1 FROM pg_constraint
      WHERE conname='site_go_links_code_ck' AND conrelid=to_regclass('public.site_go_links'))
      AS valid_go_code_constraint,
    EXISTS(SELECT 1 FROM pg_constraint
      WHERE conname='site_go_links_status_ck'
        AND conrelid=to_regclass('public.site_go_links')
        AND pg_get_constraintdef(oid) ILIKE '%paused%')
      AS valid_go_lifecycle_constraint,
    EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='site_go_link_daily_visits_day_uq' AND indexdef ILIKE '%UNIQUE INDEX%')
      AS unique_go_daily_counter
`;
const [roleChecks] = await sql`
  SELECT
    (SELECT count(*)::int FROM pg_roles r
      WHERE r.rolname IN ('anonymous','authenticated')) AS count,
    (SELECT count(*)::int FROM pg_roles r
      WHERE r.rolname IN ('anonymous','authenticated')
      AND (has_table_privilege(r.oid,'public.sites','SELECT')
        OR has_table_privilege(r.oid,'public.organizations','SELECT')
        OR has_table_privilege(r.oid,'public.site_go_links','SELECT')
        OR has_table_privilege(r.oid,'public.site_go_link_daily_visits','SELECT')
        OR has_table_privilege(r.oid,'public.site_go_link_daily_visits','INSERT')))
      AS unauthorized_selects,
    (has_table_privilege(current_user,'public.sites','SELECT')
      AND has_table_privilege(current_user,'public.organizations','SELECT')
      AND has_table_privilege(current_user,'public.site_go_links','SELECT')
      AND has_table_privilege(current_user,'public.site_go_link_daily_visits','SELECT'))
      AS application_can_read,
    (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)
      AS application_can_bypass_go_rls,
    has_table_privilege(current_user,'public.site_go_link_daily_visits','INSERT')
      AS application_can_count_redirects
`;
const recorded = await sql`
  SELECT hash, created_at FROM drizzle.__drizzle_migrations
  WHERE created_at >= ${migrations[0].when}
    AND created_at <= ${migrations.at(-1).when}
`;
assertFriendlyUrlDeployment(
  {projectId:identity.project_id,branchId:identity.branch_id,databaseName:identity.database_name},
  {...schema,...schemaChecks},
  {count:roleChecks.count,unauthorizedSelects:roleChecks.unauthorized_selects,
    applicationCanRead:roleChecks.application_can_read,
    applicationCanBypassGoRls:roleChecks.application_can_bypass_go_rls,
    applicationCanCountRedirects:roleChecks.application_can_count_redirects},
  recorded.map(item => ({createdAt:item.created_at,hash:item.hash})),
  migrations,
);
console.log("PASS: friendly URLs and Go Links deployment schema/roles match reviewed release. No data changed.");
