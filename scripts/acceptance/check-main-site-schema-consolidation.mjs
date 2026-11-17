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
        AND c.confrelid=to_regclass('education_v30.sites')) AS remaining_native_site_fks,
      (SELECT count(*)::int FROM pg_constraint c WHERE c.contype='f'
        AND c.confrelid='public.sites'::regclass) AS public_site_fks,
      to_regclass('education_v30.sites') IS NULL AS duplicate_site_retired,
      (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.sites'::regclass) AS platform_site_rls_forced,
      (SELECT count(*)::int FROM public.people) AS platform_people,
      (SELECT count(*)::int FROM education_v30.persons) AS native_people,
      (SELECT count(*)::int FROM public.access_accounts) AS platform_accounts,
      (SELECT count(*)::int FROM education_v30.canonical_accounts) AS native_accounts
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
  const [operational]=await sql`
    SELECT
      (SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE c.contype='f' AND n.nspname='public'
         AND c.confrelid='public.organizations'::regclass
         AND c.conname IN (
           'academic_course_specifications_owner_organization_id_fkey',
           'commercial_contract_parties_organization_id_fkey',
           'competency_mastery_policies_owner_organization_id_fkey',
           'content_assets_owner_organization_id_fkey',
           'curriculum_acquisitions_acquired_by_organization_id_fkey',
           'curriculum_acquisitions_source_organization_id_fkey',
           'curriculum_rights_grants_licensee_organization_id_fkey',
           'curriculum_rights_grants_rightsholder_organization_id_fkey',
           'deployment_organization_roles_organization_id_fkey',
           'deployment_site_operating_terms_operating_organization_id_fkey',
           'enrollment_referral_sources_source_organization_id_fkey',
           'foundation_delivery_policies_owner_organization_id_fkey',
           'foundation_families_owner_organization_id_fkey',
           'foundation_modules_owner_organization_id_fkey',
           'funding_eligibility_requireme_verifying_authority_organiza_fkey',
           'funding_opportunities_funder_organization_id_fkey',
           'legal_sources_issuer_organization_id_fkey',
           'offering_entitlements_organization_id_fkey',
           'organization_classifications_organization_id_fkey',
           'organization_relationships_from_organization_id_fkey',
           'organization_relationships_to_organization_id_fkey',
           'production_opportunities_commissioning_organization_id_fkey',
           'professional_service_offerings_provider_organization_id_fkey',
           'provider_authorizations_provider_organization_id_fkey',
           'provider_eligibility_reviews_provider_organization_id_fkey',
           'school_graduation_requirement_v_adopted_by_organization_id_fkey'
         ) AND c.convalidated
      ) AS direct_operational_organization_fks,
      (SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE c.contype='f' AND n.nspname='public'
         AND c.confrelid='public.people'::regclass
         AND t.relname IN (
           'funding_program_versions','institutional_approvals',
           'operation_safety_reviews','professional_availability_windows',
           'professional_service_offerings','professional_specialties',
           'verified_contact_hours'
         ) AND c.convalidated
      ) AS direct_operational_person_fks
  `;

  if(!summary.site_bridge_absent || !summary.duplicate_site_retired ||
    !summary.platform_site_rls_forced || summary.remaining_native_site_fks!==0 ||
    relocated.length!==movedTables.length||old.length!==0 ||
    fks.length!==repointedFks.length ||
    fks.some(row=>!row.points_to_public||!row.validated) ||
    operational.direct_operational_organization_fks!==26 ||
    operational.direct_operational_person_fks!==7)
    throw new Error("Consolidation milestone incomplete or a Site FK regressed");

  console.log(JSON.stringify({
    database:"CAN OS Neon main",readOnly:true,
    mainMilestoneVerified:true,fullConsolidationComplete:summary.canonical_tables===0,
    ...summary,verifiedRelocatedTables:relocated.length,
    verifiedDirectSiteForeignKeys:fks.length,
    ...operational,
    caveat:"Remaining canonical schema, authorization and browser cutover are not accepted by this check",
  },null,2));
}
main().catch(error=>{
  console.error("Main consolidation verification failed:",
    error instanceof Error?error.message:"unknown error");
  process.exitCode=1;
});
