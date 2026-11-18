#!/usr/bin/env node
/**
 * Read-only proof of CAN OS single-public-schema relocation on Neon MAIN.
 * Every claimed move is taken from the committed migration SQL, not an
 * independently maintained list of tables. No writes and no identity aliases.
 *
 * CAN_SCHEMA_CONSOLIDATION_CHECK=1 DATABASE_URL=<Neon main>
 *   node scripts/acceptance/check-public-schema-consolidation.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const repoFiles=[
  "database/production/2026-11-17-consolidate-feedback-categories.sql",
  "database/production/2026-11-17-consolidate-static-reference-tables.sql",
  "database/production/2026-11-17-consolidate-36-empty-legacy-tables.sql",
  "database/production/2026-11-17-consolidate-8-empty-operational-tables.sql",
  "database/production/2026-11-17-consolidate-four-empty-native-tables.sql",
  "database/production/2026-11-17-consolidate-19-empty-protected-tables.sql",
  "database/production/2026-11-17-consolidate-13-empty-protected-tables.sql",
  "database/production/2026-11-17-consolidate-16-empty-policy-tables.sql",
  "database/production/2026-11-17-consolidate-survey-confidential-redemptions.sql",
  "database/production/2026-11-17-migrate-blueprint-reference-catalog-to-public.sql",
  "database/production/2026-11-17-consolidate-empty-blueprints-table.sql",
  "database/production/2026-11-17-consolidate-enrollment-prospects.sql",
  "database/production/2026-11-17-consolidate-survey-definitions.sql",
  "database/production/2026-11-17-consolidate-three-view-backed-tables.sql",
  "database/production/2026-11-17-consolidate-education-operations.sql",
  "database/production/2026-11-17-consolidate-six-class-lifecycle-tables.sql",
  "database/production/2026-11-17-consolidate-six-facilitated-room-evidence-tables.sql",
  "database/production/2026-11-17-consolidate-noncredit-enrollment-waitlist.sql",
  "database/production/2026-11-18-batch-01-empty-append-only-tables.sql",
  "database/production/2026-11-18-batch-02-empty-leaf-tables.sql",
  "database/production/2026-11-18-batch-03-eight-empty-unmapped-tables.sql",
  "database/production/2026-11-18-consolidate-three-active-empty-leaf-tables.sql",
  "database/production/2026-11-18-consolidate-education-operation-sites.sql",
  "database/production/2026-11-18-consolidate-three-active-view-backed-tables.sql",
  "database/production/2026-11-18-consolidate-approved-deployment-adoptions.sql",
  "database/production/2026-11-18-consolidate-deployment-sites.sql",
];
const referenceRowCounts={
  feedback_categories:8,workforce_families:9,workforce_delivery_modes:5,
  vocabularies:12,vocabulary_terms:80,facility_capability_types:6,
  capability_delivery_modes:20,
  blueprint_reference_items:74,blueprint_reference_item_versions:74,
  religious_affiliation_options:25,
  blueprints:0,
  enrollment_prospects:0,
  survey_definitions:0,
  education_operations:1,
  education_operation_sites:1,
  deployment_offering_adoptions:1,
  deployment_sites:1,
  facilitated_learning_participants:0,facilitated_learning_playback:0,program_publication_claims:0,
  publication_withdrawals:0,learner_outcomes:0,qualification_resource_fulfillments:0,
  noncredit_enrollment_waitlist:0,
  instructional_track_command_receipts:0,learning_award_artifacts:0,official_course_requirement_versions:0,noncredit_released_seats:0,network_member_identifiers:0,
  facilitated_room_activity_releases:0,facilitated_room_activity_responses:0,facilitated_room_control_commands:0,facilitated_room_feedback:0,facilitated_room_presence_events:0,facilitated_room_survey_campaigns:0,
  academic_course_specification_versions:0,assurance_case_findings:0,course_curriculum_alignments:0,course_grading_policy_versions:0,experience_standard_versions:0,foundation_refresher_rule_versions:0,governance_policy_versions:0,qualified_creator_usage:0,class_staff_assignments:0,learning_session_events:0,learning_completion_evidence_review_requests:0,
  class_awards:0,class_enrollment_approval_requests:0,class_enrollment_invitations:0,class_enrollment_repeat_authorizations:0,class_enrollment_transfer_requests:0,class_offerings:0,
};

function migratedTableNames(){
  const tables=[];
  for(const file of repoFiles){
    const text=readFileSync(file,"utf8");
    const matches=[...text.matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm)];
    if(!matches.length)throw new Error("No reviewed table moves in "+file);
    for(const [,name] of matches){
      if(tables.includes(name))throw new Error("Duplicate migration of "+name);
      tables.push(name);
    }
  }
  return tables;
}

async function run(){
  if(process.env.CAN_SCHEMA_CONSOLIDATION_CHECK!=="1"||!process.env.DATABASE_URL)
    throw new Error("Explicit main-only read-only verification and DATABASE_URL required");
  const url=new URL(process.env.DATABASE_URL);
  if(!["postgres:","postgresql:"].includes(url.protocol))
    throw new Error("Expected PostgreSQL DATABASE_URL");
  const sql=neon(process.env.DATABASE_URL);
  const [target]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
      current_setting('neon.branch_id',true) AS branch
  `;
  if(target?.project!=="sweet-hall-62441909"||
    target?.branch!=="br-restless-sea-ar9ooo55")
    throw new Error("Refusing anything other than actual Neon main");

  const names=migratedTableNames();
  const state=await sql`
    SELECT name,
      to_regclass('public.'||name) IS NOT NULL AS public_present,
      to_regclass('education_v30.'||name) IS NOT NULL AS canonical_present
    FROM unnest(${names}::text[]) AS name
    ORDER BY name
  `;
  const missing=state.filter(row=>!row.public_present||row.canonical_present);
  if(missing.length)
    throw new Error("Incomplete relocation: "+missing.map(row=>row.name).join(", "));

  const counts=await sql`
    SELECT c.relname AS name, count_table.n::bigint AS total_rows
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
    JOIN LATERAL (
      SELECT CASE WHEN c.relname='feedback_categories'
            THEN (SELECT count(*) FROM public.feedback_categories)
        WHEN c.relname='workforce_families'
            THEN (SELECT count(*) FROM public.workforce_families)
        WHEN c.relname='workforce_delivery_modes'
            THEN (SELECT count(*) FROM public.workforce_delivery_modes)
        WHEN c.relname='vocabularies'
            THEN (SELECT count(*) FROM public.vocabularies)
        WHEN c.relname='vocabulary_terms'
            THEN (SELECT count(*) FROM public.vocabulary_terms)
        WHEN c.relname='facility_capability_types'
            THEN (SELECT count(*) FROM public.facility_capability_types)
        WHEN c.relname='capability_delivery_modes'
            THEN (SELECT count(*) FROM public.capability_delivery_modes)
        WHEN c.relname='blueprint_reference_items'
            THEN (SELECT count(*) FROM public.blueprint_reference_items)
        WHEN c.relname='blueprint_reference_item_versions'
            THEN (SELECT count(*) FROM public.blueprint_reference_item_versions)
        WHEN c.relname='religious_affiliation_options'
            THEN (SELECT count(*) FROM public.religious_affiliation_options)
        WHEN c.relname='blueprints'
            THEN (SELECT count(*) FROM public.blueprints)
        WHEN c.relname='enrollment_prospects'
            THEN (SELECT count(*) FROM public.enrollment_prospects)
        WHEN c.relname='survey_definitions'
            THEN (SELECT count(*) FROM public.survey_definitions)
        WHEN c.relname='education_operations'
            THEN (SELECT count(*) FROM public.education_operations)
        WHEN c.relname='education_operation_sites'
            THEN (SELECT count(*) FROM public.education_operation_sites)
        WHEN c.relname='deployment_offering_adoptions'
            THEN (SELECT count(*) FROM public.deployment_offering_adoptions)
        WHEN c.relname='deployment_sites'
            THEN (SELECT count(*) FROM public.deployment_sites)
        WHEN c.relname='facilitated_learning_participants'
            THEN (SELECT count(*) FROM public.facilitated_learning_participants)
        WHEN c.relname='facilitated_learning_playback'
            THEN (SELECT count(*) FROM public.facilitated_learning_playback)
        WHEN c.relname='program_publication_claims'
            THEN (SELECT count(*) FROM public.program_publication_claims)
        WHEN c.relname='publication_withdrawals'
            THEN (SELECT count(*) FROM public.publication_withdrawals)
        WHEN c.relname='learner_outcomes'
            THEN (SELECT count(*) FROM public.learner_outcomes)
        WHEN c.relname='qualification_resource_fulfillments'
            THEN (SELECT count(*) FROM public.qualification_resource_fulfillments)
        WHEN c.relname='class_awards'
            THEN (SELECT count(*) FROM public.class_awards)
        WHEN c.relname='class_enrollment_approval_requests'
            THEN (SELECT count(*) FROM public.class_enrollment_approval_requests)
        WHEN c.relname='class_enrollment_invitations'
            THEN (SELECT count(*) FROM public.class_enrollment_invitations)
        WHEN c.relname='class_enrollment_repeat_authorizations'
            THEN (SELECT count(*) FROM public.class_enrollment_repeat_authorizations)
        WHEN c.relname='class_enrollment_transfer_requests'
            THEN (SELECT count(*) FROM public.class_enrollment_transfer_requests)
        WHEN c.relname='class_offerings'
            THEN (SELECT count(*) FROM public.class_offerings)
        WHEN c.relname='facilitated_room_activity_releases'
            THEN (SELECT count(*) FROM public.facilitated_room_activity_releases)
        WHEN c.relname='facilitated_room_activity_responses'
            THEN (SELECT count(*) FROM public.facilitated_room_activity_responses)
        WHEN c.relname='facilitated_room_control_commands'
            THEN (SELECT count(*) FROM public.facilitated_room_control_commands)
        WHEN c.relname='facilitated_room_feedback'
            THEN (SELECT count(*) FROM public.facilitated_room_feedback)
        WHEN c.relname='facilitated_room_presence_events'
            THEN (SELECT count(*) FROM public.facilitated_room_presence_events)
        WHEN c.relname='facilitated_room_survey_campaigns'
            THEN (SELECT count(*) FROM public.facilitated_room_survey_campaigns)
        WHEN c.relname='noncredit_enrollment_waitlist'
            THEN (SELECT count(*) FROM public.noncredit_enrollment_waitlist)
        WHEN c.relname='instructional_track_command_receipts'
            THEN (SELECT count(*) FROM public.instructional_track_command_receipts)
        WHEN c.relname='learning_award_artifacts'
            THEN (SELECT count(*) FROM public.learning_award_artifacts)
        WHEN c.relname='official_course_requirement_versions'
            THEN (SELECT count(*) FROM public.official_course_requirement_versions)
        WHEN c.relname='noncredit_released_seats'
            THEN (SELECT count(*) FROM public.noncredit_released_seats)
        WHEN c.relname='network_member_identifiers'
            THEN (SELECT count(*) FROM public.network_member_identifiers)
        WHEN c.relname='academic_course_specification_versions'
            THEN (SELECT count(*) FROM public.academic_course_specification_versions)
        WHEN c.relname='assurance_case_findings'
            THEN (SELECT count(*) FROM public.assurance_case_findings)
        WHEN c.relname='course_curriculum_alignments'
            THEN (SELECT count(*) FROM public.course_curriculum_alignments)
        WHEN c.relname='course_grading_policy_versions'
            THEN (SELECT count(*) FROM public.course_grading_policy_versions)
        WHEN c.relname='experience_standard_versions'
            THEN (SELECT count(*) FROM public.experience_standard_versions)
        WHEN c.relname='foundation_refresher_rule_versions'
            THEN (SELECT count(*) FROM public.foundation_refresher_rule_versions)
        WHEN c.relname='governance_policy_versions'
            THEN (SELECT count(*) FROM public.governance_policy_versions)
        WHEN c.relname='qualified_creator_usage'
            THEN (SELECT count(*) FROM public.qualified_creator_usage)
        WHEN c.relname='class_staff_assignments'
            THEN (SELECT count(*) FROM public.class_staff_assignments)
        WHEN c.relname='learning_session_events'
            THEN (SELECT count(*) FROM public.learning_session_events)
        WHEN c.relname='learning_completion_evidence_review_requests'
            THEN (SELECT count(*) FROM public.learning_completion_evidence_review_requests)
        END AS n
    ) count_table ON true
    WHERE ns.nspname='public' AND c.relname=ANY(${Object.keys(referenceRowCounts)}::text[])
  `;
  for(const row of counts){
    if(Number(row.total_rows)!==referenceRowCounts[row.name])
      throw new Error("Reference record count changed: "+row.name);
  }
  // The public-site projection is intentionally still an education_v30
  // SECURITY DEFINER routine while the old function namespace is retired.
  // Its single Operation-to-Site join must resolve the authoritative public
  // relation, without widening the function's fixed search_path or grants.
  const [siteProjection]=await sql`
    SELECT p.prosecdef AS security_definer,
      p.proconfig AS secure_path,
      p.proacl::text AS acl,
      (p.prosrc LIKE '%LEFT JOIN public.education_operation_sites os%')
        AS reads_public_site_relation
    FROM pg_proc p
    WHERE p.oid='education_v30.v301_public_site_claims(text)'::regprocedure
  `;
  if(!siteProjection?.security_definer ||
      !siteProjection?.reads_public_site_relation ||
      siteProjection.acl!=='{neondb_owner=X/neondb_owner}' ||
      JSON.stringify(siteProjection.secure_path)!==
        JSON.stringify(['search_path=pg_catalog, education_v30, pg_temp']))
    throw new Error("Public-site projection/security contract changed after Operation Site consolidation");


  // The instructional-track publication validator continues to enforce its
  // original business rule under the same locked-down function configuration.
  const [adoptionValidator]=await sql`
    SELECT p.prosecdef AS security_definer,p.proconfig AS path,
      p.proacl::text AS acl,
      (p.prosrc LIKE '%FROM public.deployment_offering_adoptions a%') AS reads_public
    FROM pg_proc p
    WHERE p.oid='education_v30.validate_instructional_track_policy_publication()'::regprocedure
  `;
  if(!adoptionValidator || adoptionValidator.security_definer ||
      !adoptionValidator.reads_public || adoptionValidator.acl!==null ||
      JSON.stringify(adoptionValidator.path)!==
        JSON.stringify(['search_path=education_v30, pg_catalog']))
    throw new Error("Deployment adoption publication validator cutover failed");


  // The active deployment-site contract has no direct authenticated grants.
  // Its guarded trigger functions must still use the authoritative public table.
  const [siteValidators]=await sql`
    SELECT count(*)::int AS valid_count FROM pg_proc p
    WHERE p.oid IN (
      'education_v30.v29_guard_operational_gate()'::regprocedure,
      'education_v30.v30_guard_shared_resource_allocation()'::regprocedure
    )
    AND p.prosecdef
    AND p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
    AND p.prosrc LIKE '%FROM public.deployment_sites ds%'
  `;
  if(siteValidators?.valid_count!==2)
    throw new Error("Deployment Site function rebinding was not preserved");

  // Security must not be weakened by a physical schema move. The two guarded
  // protected-table batches retained their existing FORCE RLS and policies.
  const protectedNames=[
    ...readFileSync("database/production/2026-11-17-consolidate-19-empty-protected-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-consolidate-13-empty-protected-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-consolidate-16-empty-policy-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-consolidate-survey-confidential-redemptions.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-migrate-blueprint-reference-catalog-to-public.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-consolidate-empty-blueprints-table.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-consolidate-enrollment-prospects.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-consolidate-survey-definitions.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-consolidate-education-operations.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...[...readFileSync("database/production/2026-11-17-consolidate-three-view-backed-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm)]
      .filter(match=>match[1]!=="publication_withdrawals"),
    ...readFileSync("database/production/2026-11-17-consolidate-six-class-lifecycle-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-consolidate-six-facilitated-room-evidence-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-17-consolidate-noncredit-enrollment-waitlist.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...[...readFileSync("database/production/2026-11-18-batch-02-empty-leaf-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm)]
      .filter(match=>match[1]!=="official_course_requirement_versions"),
    ...[...readFileSync("database/production/2026-11-18-batch-03-eight-empty-unmapped-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm)]
      .filter(match=>["assurance_case_findings","experience_standard_versions","governance_policy_versions","qualified_creator_usage"].includes(match[1])),
    ...readFileSync("database/production/2026-11-18-consolidate-three-active-empty-leaf-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-18-consolidate-education-operation-sites.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-18-consolidate-three-active-view-backed-tables.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
    ...readFileSync("database/production/2026-11-18-consolidate-approved-deployment-adoptions.sql","utf8")
      .matchAll(/^ALTER TABLE education_v30\.([a-z_]+) SET SCHEMA public;$/gm),
  ].map(match=>match[1]);
  if(protectedNames.length!==87)throw new Error("Expected 87 reviewed protected table relocations");
  const security=await sql`
    SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY(${protectedNames}::text[])
  `;
  const insecure=security.filter(row=>!row.rls||!row.forced||Number(row.policy_count)<1);
  if(security.length!==protectedNames.length||insecure.length)
    throw new Error("Protected-table RLS relocation incomplete: "+
      insecure.map(row=>row.name).join(", "));

  const fk=await sql`
    SELECT count(*)::int AS count
    FROM pg_constraint c
      JOIN pg_class dest ON dest.oid=c.confrelid
      JOIN pg_namespace n ON n.oid=dest.relnamespace
    WHERE c.contype='f'
      AND n.nspname='public'
      AND dest.relname=ANY(${names}::text[])
  `;
  const [overall]=await sql`
    SELECT
      (SELECT count(*)::int FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE') AS public_tables,
      (SELECT count(*)::int FROM information_schema.tables
       WHERE table_schema='education_v30' AND table_type='BASE TABLE') AS canonical_tables,
      to_regclass('public.site_canonical_identity_links') IS NULL AS site_identity_bridge_retired
  `;
  console.log(JSON.stringify({branch:target.branch,readOnly:true,verifiedMoves:names.length,
    referencesRetained:counts.reduce((n,row)=>n+Number(row.total_rows),0),
    fkReferencesToMovedTables:Number(fk[0]?.count??0),
    protectedTablesWithRls:security.length,
    ...overall,fullyUnified:overall.canonical_tables===0},null,2));
  if(overall.canonical_tables!==0)process.exitCode=2;
}
run().catch(error=>{
  console.error("Single-schema reconciliation failed:",
    error instanceof Error?error.message:"unknown");
  process.exitCode=1;
});
