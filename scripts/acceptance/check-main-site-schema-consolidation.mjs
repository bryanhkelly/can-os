#!/usr/bin/env node
/**
 * Read-only, main-only milestone check for physical Site/schema consolidation.
 * This is NOT a production readiness or full-platform integration certificate.
 *
 * CAN_MAIN_SITE_CONSOLIDATION_CHECK=1 DATABASE_URL=<Neon main URL> \
 *   node scripts/acceptance/check-main-site-schema-consolidation.mjs
 */
import { neon } from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const movedTables=[
  "content_assets","deployment_organization_roles","enrollment_site_placements",
  "feedback_categories","workforce_families","workforce_delivery_modes",
  "vocabularies","vocabulary_terms","facility_capability_types","capability_delivery_modes",
];
const repointedFks=[
  "deployment_organization_roles_site_id_fkey",
  "institutional_approvals_site_id_fkey",
  "operation_calendar_days_site_id_fkey",
  "operation_safety_requirements_site_id_fkey",
];

async function main(){
  if(process.env.CAN_MAIN_SITE_CONSOLIDATION_CHECK!=="1")
    throw new Error("Explicit CAN_MAIN_SITE_CONSOLIDATION_CHECK=1 is required");
  const url=process.env.DATABASE_URL;
  if(!url)throw new Error("DATABASE_URL is required");
  const sql=neon(url);
  const [branch]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
           current_setting('neon.branch_id',true) AS branch,
           current_database() AS database
  `;
  if(branch?.project!==PROJECT||branch?.branch!==MAIN||branch?.database!=="neondb")
    throw new Error("Refusing a database other than CAN OS production main");

  const [summary]=await sql`
    SELECT
      (SELECT count(*)::int FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE') AS public_tables,
      (SELECT count(*)::int FROM information_schema.tables
       WHERE table_schema='education_v30' AND table_type='BASE TABLE') AS canonical_tables,
      to_regclass('public.site_canonical_identity_links') IS NULL AS site_bridge_absent,
      (SELECT count(*)::int FROM pg_constraint c WHERE c.contype='f'
        AND c.confrelid='education_v30.sites'::regclass) AS remaining_native_site_fks,
      (SELECT count(*)::int FROM pg_constraint c WHERE c.contype='f'
        AND c.confrelid='public.sites'::regclass) AS public_site_fks
  `;
  const relocated=await sql`
    SELECT c.relname AS name,c.oid::text AS oid,
      (SELECT count(*)::int FROM pg_constraint f
       WHERE f.contype='f' AND (f.confrelid=c.oid OR f.conrelid=c.oid)) AS fk_relationships
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname IN ('content_assets','deployment_organization_roles','enrollment_site_placements','feedback_categories','workforce_families','workforce_delivery_modes','vocabularies','vocabulary_terms','facility_capability_types','capability_delivery_modes')
    ORDER BY c.relname
  `;
  const old=await sql`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='education_v30' AND c.relname IN ('content_assets','deployment_organization_roles','enrollment_site_placements','feedback_categories','workforce_families','workforce_delivery_modes','vocabularies','vocabulary_terms','facility_capability_types','capability_delivery_modes')
  `;
  const fks=await sql`
    SELECT c.conname AS name,
      c.confrelid='public.sites'::regclass AS points_to_public,
      c.convalidated AS validated
    FROM pg_constraint c
    WHERE c.contype='f' AND c.conname IN ('deployment_organization_roles_site_id_fkey','institutional_approvals_site_id_fkey','operation_calendar_days_site_id_fkey','operation_safety_requirements_site_id_fkey')
    ORDER BY c.conname
  `;
  if(!summary.site_bridge_absent ||
    relocated.length!==movedTables.length||old.length!==0 ||
    fks.length!==repointedFks.length ||
    fks.some(row=>!row.points_to_public||!row.validated))
    throw new Error("Consolidation milestone incomplete or a Site FK regressed");

  console.log(JSON.stringify({
    database:"CAN OS Neon main",readOnly:true,
    mainMilestoneVerified:true,fullConsolidationComplete:summary.canonical_tables===0,
    ...summary,verifiedRelocatedTables:relocated.length,
    verifiedDirectSiteForeignKeys:fks.length,
    caveat:"Remaining canonical schema, authorization and browser cutover are not accepted by this check",
  },null,2));
}
main().catch(error=>{
  console.error("Main consolidation verification failed:",
    error instanceof Error?error.message:"unknown error");
  process.exitCode=1;
});
