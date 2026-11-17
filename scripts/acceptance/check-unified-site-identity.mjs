#!/usr/bin/env node
/**
 * Read-only, fail-closed inventory for a ONE-Site-identity migration.
 *
 * Never performs name-based matching, inserts, updates, FK rekeys, grants or
 * schema changes. It intentionally exits nonzero while the duplicated Site
 * authority still exists. All findings must be independently reviewed.
 *
 * Usage:
 *   APP_ENV=test CAN_TEST_DB_WRITES_ENABLED=true
 *   CAN_SITE_IDENTITY_PREFLIGHT=1
 *   CAN_APPLICATION_DB_HOST=<production database hostname>
 *   CAN_SITE_IDENTITY_TEST_BRANCH_ID=<isolated br-...>
 *   TEST_DATABASE_URL=<isolated PostgreSQL URL>
 *   node scripts/acceptance/check-unified-site-identity.mjs
 *
 * The shared branch guard requires CAN_TEST_DB_WRITES_ENABLED=true, despite
 * this particular command being strictly read-only.
 */
import { neon } from "@neondatabase/serverless";
import { verifyAdmissionsNeonBranch } from "../verify-admissions-neon-branch.mjs";

async function main() {
  const env=process.env;
  if(env.APP_ENV!=="test"||env.CAN_SITE_IDENTITY_PREFLIGHT!=="1") {
    throw new Error("Site-identity preflight requires APP_ENV=test and CAN_SITE_IDENTITY_PREFLIGHT=1");
  }
  const branchId=env.CAN_SITE_IDENTITY_TEST_BRANCH_ID;
  if(!branchId)throw new Error("Explicit nonproduction CAN_SITE_IDENTITY_TEST_BRANCH_ID is required");
  await verifyAdmissionsNeonBranch({...env,CAN_ADMISSIONS_TEST_BRANCH_ID:branchId});

  const sql=neon(env.TEST_DATABASE_URL);
  // Both tables must be visible before interpreting an inventory; a missing
  // schema does not count as a successful cutover.
  const [objects]=await sql`
    SELECT to_regclass('public.sites') IS NOT NULL AS public_sites_present,
           to_regclass('education_v30.sites') IS NOT NULL AS canonical_sites_present,
           to_regclass('public.site_canonical_identity_links') IS NOT NULL AS legacy_link_present
  `;
  if(!objects?.public_sites_present||!objects?.canonical_sites_present)
    throw new Error("Expected both currently deployed Site tables. An absent table requires a separate post-cutover verifier.");

  const [summary]=await sql`
    SELECT
      (SELECT count(*)::int FROM public.sites) AS public_sites,
      (SELECT count(*)::int FROM education_v30.sites) AS canonical_sites,
      (SELECT count(*)::int FROM public.sites p
        JOIN education_v30.sites c ON c.id=p.id) AS shared_uuids,
      (SELECT count(*)::int FROM public.sites p
        WHERE NOT EXISTS(SELECT 1 FROM education_v30.sites c WHERE c.id=p.id)) AS public_only_uuids,
      (SELECT count(*)::int FROM education_v30.sites c
        WHERE NOT EXISTS(SELECT 1 FROM public.sites p WHERE p.id=c.id)) AS canonical_only_uuids,
      (SELECT count(*)::int FROM education_v30.classes) AS canonical_classes,
      (SELECT count(*)::int FROM education_v30.class_sessions) AS canonical_sessions
  `;
  const references=await sql`
    SELECT tn.nspname AS target_schema, t.relname AS target_table,
           count(*)::int AS fk_constraints,
           count(DISTINCT src.oid)::int AS referencing_tables
    FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.confrelid
      JOIN pg_namespace tn ON tn.oid=t.relnamespace
      JOIN pg_class src ON src.oid=c.conrelid
    WHERE c.contype='f'
      AND c.confrelid IN ('public.sites'::regclass,'education_v30.sites'::regclass)
    GROUP BY tn.nspname,t.relname
    ORDER BY tn.nspname,t.relname
  `;
  const inboundForeignKeys=await sql`
    SELECT src_ns.nspname || '.' || src.relname AS referencing_table,
           c.conname AS constraint_name,
           trg_ns.nspname || '.' || target.relname AS target_table,
           pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
      JOIN pg_class src ON src.oid=c.conrelid
      JOIN pg_namespace src_ns ON src_ns.oid=src.relnamespace
      JOIN pg_class target ON target.oid=c.confrelid
      JOIN pg_namespace trg_ns ON trg_ns.oid=target.relnamespace
    WHERE c.contype='f'
      AND c.confrelid IN ('public.sites'::regclass,'education_v30.sites'::regclass)
    ORDER BY referencing_table,constraint_name
  `;
  const siteIdColumns=await sql`
    SELECT table_schema || '.' || table_name AS relation,column_name
    FROM information_schema.columns
    WHERE table_schema IN ('public','education_v30')
      AND (column_name='site_id' OR column_name IN ('public_site_id','canonical_site_id'))
    ORDER BY table_schema,table_name,column_name
  `;
  const siteRls=await sql`
    SELECT n.nspname || '.' || c.relname AS relation,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.oid IN ('public.sites'::regclass,'education_v30.sites'::regclass)
    ORDER BY relation
  `;
  const potentialNames=await sql`
    SELECT p.id AS public_id,c.id AS canonical_id,p.name AS public_name,c.name AS canonical_name
    FROM public.sites p
    JOIN education_v30.sites c ON lower(btrim(p.name))=lower(btrim(c.name))
    WHERE p.id<>c.id
    ORDER BY p.id,c.id
    LIMIT 25
  `;

  let identityLinks=null;
  if(objects.legacy_link_present){
    const [links]=await sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE status='approved')::int AS approved,
             count(*) FILTER (WHERE status='pending')::int AS pending
      FROM public.site_canonical_identity_links
    `;
    identityLinks=links;
  }
  const report={
    readOnly:true,branchId,
    decision:"NOT_READY",
    platformAuthority:"public.sites",
    target:"one platform Site UUID; education-only one-to-one extension",
    summary,
    referencingForeignKeys:references,
    inboundForeignKeyDetails:inboundForeignKeys,
    siteIdentifierColumnInventory:siteIdColumns,
    currentSiteTableRls:siteRls,
    legacyLinks:identityLinks,
    sameNameDifferentUuidCandidates:potentialNames.map(row=>({...row,
      diagnosticOnly:"Never reconcile by matching names"
    })),
    requiredBeforeCutover:[
      "review every Site, Person, Organization and permission relationship",
      "review FK updates, non-FK references, RLS, functions, triggers and data provenance",
      "rehearse audited one-time migration and rollback on isolated QA",
      "verify browser and Class/Sessions/enrollment through one Site UUID",
    ],
  };
  console.log(JSON.stringify(report,null,2));
  // The duplicate physical Site tables still exist. An inventory must not be
  // mistaken for a passing end-to-end or completed data migration.
  process.exitCode=2;
}

main().catch(error=>{
  console.error("Unified Site identity preflight failed:",
    error instanceof Error?error.message:"unknown error");
  process.exitCode=1;
});
