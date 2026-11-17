-- CAN OS one-schema consolidation, dependency-screened empty objects.
-- Executed only against the actual main Neon database.
-- Every table is empty and unreferenced by SQL functions, views, runtime
-- GitHub code search, user triggers, policies, or explicit table-level ACL.
-- This is NOT the cutover of education_v30 or any shared identity.
-- Existing table OIDs and all inbound/outbound foreign keys are preserved.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
DECLARE name text; object_id oid; current_count bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Wrong Neon database branch'; END IF;
 FOREACH name IN ARRAY ARRAY[
    'academic_terms',
    'commercial_contracts',
    'program_cohorts',
    'academic_course_specifications',
    'funding_opportunities',
    'operation_academic_years',
    'professional_service_offerings',
    'competency_mastery_policies',
    'course_readiness_profiles',
    'curriculum_acquisitions',
    'curriculum_production_packages',
    'education_capability_requirements',
    'equipment_catalog',
    'foundation_delivery_policies',
    'foundation_families',
    'foundation_modules',
    'funding_eligibility_requirements',
    'funding_program_versions',
    'legal_sources',
    'operation_safety_requirements',
    'commercial_contract_parties',
    'course_unit_assets',
    'deployment_site_operating_terms',
    'education_requirement_fulfillments',
    'enrollment_referral_sources',
    'funding_version_sources',
    'network_operation_participations',
    'offering_entitlements',
    'offering_families',
    'operation_calendar_days',
    'operation_safety_reviews',
    'professional_availability_windows',
    'professional_specialties',
    'school_graduation_requirement_versions',
    'technology_access_requirements',
    'verified_contact_hours'
 ] LOOP
   object_id:=to_regclass('education_v30.'||name);
   IF object_id IS NULL OR to_regclass('public.'||name) IS NOT NULL
   THEN RAISE EXCEPTION 'Changed source/destination table: %',name; END IF;
   IF NOT EXISTS(
     SELECT 1 FROM pg_class c
     WHERE c.oid=object_id AND c.relkind='r' AND NOT c.relrowsecurity
       AND NOT c.relforcerowsecurity AND c.relacl IS NULL
   ) OR EXISTS(
     SELECT 1 FROM pg_policies WHERE schemaname='education_v30' AND tablename=name
   ) OR EXISTS(
     SELECT 1 FROM pg_trigger t WHERE t.tgrelid=object_id AND NOT t.tgisinternal
   ) OR EXISTS(
     SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||name||'%'
   ) OR EXISTS(
     SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||name||'%'
   ) THEN RAISE EXCEPTION 'Table dependency/permission changed: %',name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO current_count;
   IF current_count<>0 THEN RAISE EXCEPTION 'Table is no longer empty: %',name; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.academic_terms SET SCHEMA public;
ALTER TABLE education_v30.commercial_contracts SET SCHEMA public;
ALTER TABLE education_v30.program_cohorts SET SCHEMA public;
ALTER TABLE education_v30.academic_course_specifications SET SCHEMA public;
ALTER TABLE education_v30.funding_opportunities SET SCHEMA public;
ALTER TABLE education_v30.operation_academic_years SET SCHEMA public;
ALTER TABLE education_v30.professional_service_offerings SET SCHEMA public;
ALTER TABLE education_v30.competency_mastery_policies SET SCHEMA public;
ALTER TABLE education_v30.course_readiness_profiles SET SCHEMA public;
ALTER TABLE education_v30.curriculum_acquisitions SET SCHEMA public;
ALTER TABLE education_v30.curriculum_production_packages SET SCHEMA public;
ALTER TABLE education_v30.education_capability_requirements SET SCHEMA public;
ALTER TABLE education_v30.equipment_catalog SET SCHEMA public;
ALTER TABLE education_v30.foundation_delivery_policies SET SCHEMA public;
ALTER TABLE education_v30.foundation_families SET SCHEMA public;
ALTER TABLE education_v30.foundation_modules SET SCHEMA public;
ALTER TABLE education_v30.funding_eligibility_requirements SET SCHEMA public;
ALTER TABLE education_v30.funding_program_versions SET SCHEMA public;
ALTER TABLE education_v30.legal_sources SET SCHEMA public;
ALTER TABLE education_v30.operation_safety_requirements SET SCHEMA public;
ALTER TABLE education_v30.commercial_contract_parties SET SCHEMA public;
ALTER TABLE education_v30.course_unit_assets SET SCHEMA public;
ALTER TABLE education_v30.deployment_site_operating_terms SET SCHEMA public;
ALTER TABLE education_v30.education_requirement_fulfillments SET SCHEMA public;
ALTER TABLE education_v30.enrollment_referral_sources SET SCHEMA public;
ALTER TABLE education_v30.funding_version_sources SET SCHEMA public;
ALTER TABLE education_v30.network_operation_participations SET SCHEMA public;
ALTER TABLE education_v30.offering_entitlements SET SCHEMA public;
ALTER TABLE education_v30.offering_families SET SCHEMA public;
ALTER TABLE education_v30.operation_calendar_days SET SCHEMA public;
ALTER TABLE education_v30.operation_safety_reviews SET SCHEMA public;
ALTER TABLE education_v30.professional_availability_windows SET SCHEMA public;
ALTER TABLE education_v30.professional_specialties SET SCHEMA public;
ALTER TABLE education_v30.school_graduation_requirement_versions SET SCHEMA public;
ALTER TABLE education_v30.technology_access_requirements SET SCHEMA public;
ALTER TABLE education_v30.verified_contact_hours SET SCHEMA public;
DO $verify$
DECLARE name text; current_count bigint;
BEGIN
 FOREACH name IN ARRAY ARRAY[
    'academic_terms',
    'commercial_contracts',
    'program_cohorts',
    'academic_course_specifications',
    'funding_opportunities',
    'operation_academic_years',
    'professional_service_offerings',
    'competency_mastery_policies',
    'course_readiness_profiles',
    'curriculum_acquisitions',
    'curriculum_production_packages',
    'education_capability_requirements',
    'equipment_catalog',
    'foundation_delivery_policies',
    'foundation_families',
    'foundation_modules',
    'funding_eligibility_requirements',
    'funding_program_versions',
    'legal_sources',
    'operation_safety_requirements',
    'commercial_contract_parties',
    'course_unit_assets',
    'deployment_site_operating_terms',
    'education_requirement_fulfillments',
    'enrollment_referral_sources',
    'funding_version_sources',
    'network_operation_participations',
    'offering_entitlements',
    'offering_families',
    'operation_calendar_days',
    'operation_safety_reviews',
    'professional_availability_windows',
    'professional_specialties',
    'school_graduation_requirement_versions',
    'technology_access_requirements',
    'verified_contact_hours'
 ] LOOP
   IF to_regclass('education_v30.'||name) IS NOT NULL
      OR to_regclass('public.'||name) IS NULL
   THEN RAISE EXCEPTION 'Schema move incomplete: %',name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',name) INTO current_count;
   IF current_count<>0 THEN RAISE EXCEPTION 'Unexpected rows after move: %',name; END IF;
 END LOOP;
END $verify$;
COMMIT;
