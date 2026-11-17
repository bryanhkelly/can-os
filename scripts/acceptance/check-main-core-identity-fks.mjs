#!/usr/bin/env node
/**
 * Main-only, read-only FK convergence check. This is a safe milestone,
 * NOT a Site/Organization table retirement or RLS release certificate.
 *
 * CAN_MAIN_CORE_IDENTITY_CHECK=1 DATABASE_URL=<CAN OS Neon main URL>
 *   node scripts/acceptance/check-main-core-identity-fks.mjs
 */
import { neon } from "@neondatabase/serverless";
const PROJECT="sweet-hall-62441909",MAIN="br-restless-sea-ar9ooo55";

async function run(){
  if(process.env.CAN_MAIN_CORE_IDENTITY_CHECK!=="1")
    throw new Error("Set CAN_MAIN_CORE_IDENTITY_CHECK=1");
  const url=process.env.DATABASE_URL;
  if(!url||!["postgres:","postgresql:"].includes(new URL(url).protocol))
    throw new Error("DATABASE_URL must use PostgreSQL");
  const sql=neon(url);
  const [id]=await sql`
    SELECT current_setting('neon.project_id',true) AS project_id,
      current_setting('neon.branch_id',true) AS branch_id,
      current_database() AS database_name
  `;
  if(id?.project_id!==PROJECT||id?.branch_id!==MAIN||id?.database_name!=="neondb")
    throw new Error("Refusing any database other than CAN OS Neon main");
  const [summary]=await sql`
    SELECT
      (SELECT count(*)::int FROM pg_constraint
       WHERE contype='f' AND confrelid=to_regclass('education_v30.sites')) AS legacy_site_fk_count,
      (SELECT count(*)::int FROM pg_constraint
       WHERE contype='f' AND confrelid=to_regclass('education_v30.organizations')) AS legacy_org_fk_count,
      (SELECT count(*)::int FROM pg_constraint
       WHERE contype='f' AND confrelid='public.sites'::regclass) AS platform_site_fk_count,
      (SELECT count(*)::int FROM pg_constraint
       WHERE contype='f' AND confrelid='public.organizations'::regclass) AS platform_org_fk_count,
      to_regclass('education_v30.sites') IS NOT NULL AS duplicate_site_table_exists,
      to_regclass('education_v30.organizations') IS NOT NULL AS duplicate_org_table_exists,
      to_regclass('public.site_canonical_identity_links') IS NULL AS site_identity_bridge_absent,
      (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
       WHERE oid='public.sites'::regclass) AS platform_site_rls_forced,
      (SELECT count(*)::int FROM public.sites) AS platform_sites,
      (SELECT count(*)::int FROM public.organizations) AS platform_organizations,
      (SELECT count(*)::int FROM education_v30.persons) AS native_persons,
      (SELECT count(*)::int FROM pg_constraint
       WHERE contype='f' AND confrelid='education_v30.persons'::regclass) AS remaining_native_person_fks
  `;
  if(summary.legacy_site_fk_count!==0||summary.legacy_org_fk_count!==0||
     !summary.site_identity_bridge_absent||
     summary.platform_site_fk_count<94||summary.platform_org_fk_count<229)
    throw new Error("Shared Site/Organization FK milestone regressed");

  // No name matching or crosswalk. While duplicate tables remain, their
  // UUIDs must already exist in the authoritative source.
  if(summary.duplicate_site_table_exists){
    const [check]=await sql`
      SELECT count(*)::int AS mismatch FROM education_v30.sites native
      LEFT JOIN public.sites platform ON platform.id=native.id
      WHERE platform.id IS NULL
       OR platform.reference_code IS DISTINCT FROM native.code
       OR platform.lifecycle_status IS DISTINCT FROM native.status
       OR platform.site_kind IS DISTINCT FROM native.site_kind
    `;
    if(check.mismatch!==0)throw new Error("Native Site attributes not preserved on shared identity");
  }
  if(summary.duplicate_org_table_exists){
    const [check]=await sql`
      SELECT count(*)::int AS mismatch FROM education_v30.organizations native
      LEFT JOIN public.organizations platform ON platform.id=native.id
      WHERE platform.id IS NULL
       OR platform.lifecycle_status IS DISTINCT FROM native.status
       OR platform.external_reference IS DISTINCT FROM native.external_reference
    `;
    if(check.mismatch!==0)throw new Error("Native Organization attributes not preserved on shared identity");
  }
  console.log(JSON.stringify({
    checkedOn:"CAN OS Neon main",readOnly:true,
    siteAndOrganizationForeignKeysConverged:true,
    ...summary,
    fullyConsolidated:!summary.duplicate_site_table_exists&&
      !summary.duplicate_org_table_exists&&summary.remaining_native_person_fks===0,
    warnings:[
      "No site/org bridge or foreign key to duplicate identity is required",
      "Existing duplicate table removal and application/SQL function refactoring are separate",
      "Public Site RLS and authenticated production browser acceptance are separate release gates",
    ],
  },null,2));
}
run().catch(error=>{
  console.error("Main core identity FK milestone failed:",
    error instanceof Error?error.message:"unknown");
  process.exitCode=1;
});
