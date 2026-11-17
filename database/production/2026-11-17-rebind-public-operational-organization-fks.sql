-- Single Organization identity: public operational tables reference public.organizations.
-- Neon main only. Exactly 26 reviewed FK constraints across 23 empty
-- public tables. Does NOT change active public.access_adult_learning_reviews.
-- No bridge, guessed name matching, data copies, grant creation or RLS change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='80s';
DO $guard$
DECLARE item record; rec oid; count_rows bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Wrong Neon branch'; END IF;
 IF to_regclass('public.organizations') IS NULL THEN RAISE EXCEPTION 'Shared Organization missing'; END IF;
 IF EXISTS(SELECT 1 FROM education_v30.organizations n
    WHERE NOT EXISTS(SELECT 1 FROM public.organizations p WHERE p.id=n.id))
 THEN RAISE EXCEPTION 'Canonical Organization ID not present in platform'; END IF;
 FOR item IN SELECT * FROM (VALUES
    ('academic_course_specifications','academic_course_specifications_owner_organization_id_fkey','owner_organization_id'),
    ('commercial_contract_parties','commercial_contract_parties_organization_id_fkey','organization_id'),
    ('competency_mastery_policies','competency_mastery_policies_owner_organization_id_fkey','owner_organization_id'),
    ('content_assets','content_assets_owner_organization_id_fkey','owner_organization_id'),
    ('curriculum_acquisitions','curriculum_acquisitions_acquired_by_organization_id_fkey','acquired_by_organization_id'),
    ('curriculum_acquisitions','curriculum_acquisitions_source_organization_id_fkey','source_organization_id'),
    ('curriculum_rights_grants','curriculum_rights_grants_licensee_organization_id_fkey','licensee_organization_id'),
    ('curriculum_rights_grants','curriculum_rights_grants_rightsholder_organization_id_fkey','rightsholder_organization_id'),
    ('deployment_organization_roles','deployment_organization_roles_organization_id_fkey','organization_id'),
    ('deployment_site_operating_terms','deployment_site_operating_terms_operating_organization_id_fkey','operating_organization_id'),
    ('enrollment_referral_sources','enrollment_referral_sources_source_organization_id_fkey','source_organization_id'),
    ('foundation_delivery_policies','foundation_delivery_policies_owner_organization_id_fkey','owner_organization_id'),
    ('foundation_families','foundation_families_owner_organization_id_fkey','owner_organization_id'),
    ('foundation_modules','foundation_modules_owner_organization_id_fkey','owner_organization_id'),
    ('funding_eligibility_requirements','funding_eligibility_requireme_verifying_authority_organiza_fkey','verifying_authority_organization_id'),
    ('funding_opportunities','funding_opportunities_funder_organization_id_fkey','funder_organization_id'),
    ('legal_sources','legal_sources_issuer_organization_id_fkey','issuer_organization_id'),
    ('offering_entitlements','offering_entitlements_organization_id_fkey','organization_id'),
    ('organization_classifications','organization_classifications_organization_id_fkey','organization_id'),
    ('organization_relationships','organization_relationships_from_organization_id_fkey','from_organization_id'),
    ('organization_relationships','organization_relationships_to_organization_id_fkey','to_organization_id'),
    ('production_opportunities','production_opportunities_commissioning_organization_id_fkey','commissioning_organization_id'),
    ('professional_service_offerings','professional_service_offerings_provider_organization_id_fkey','provider_organization_id'),
    ('provider_authorizations','provider_authorizations_provider_organization_id_fkey','provider_organization_id'),
    ('provider_eligibility_reviews','provider_eligibility_reviews_provider_organization_id_fkey','provider_organization_id'),
    ('school_graduation_requirement_versions','school_graduation_requirement_v_adopted_by_organization_id_fkey','adopted_by_organization_id')
 ) AS selected(table_name,constraint_name,column_name) LOOP
  rec:=to_regclass('public.'||item.table_name);
  IF rec IS NULL THEN RAISE EXCEPTION 'Table missing: %',item.table_name; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',item.table_name) INTO count_rows;
  IF count_rows<>0 THEN RAISE EXCEPTION 'Operational table now populated: %',item.table_name; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint c WHERE c.conrelid=rec AND c.contype='f'
      AND c.conname=item.constraint_name
      AND c.confrelid='education_v30.organizations'::regclass
      AND pg_get_constraintdef(c.oid)=
        'FOREIGN KEY ('||item.column_name||') REFERENCES education_v30.organizations(id)'
  ) THEN RAISE EXCEPTION 'Changed Organization FK: %',item.constraint_name; END IF;
 END LOOP;
END $guard$;
DO $migrate$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('academic_course_specifications','academic_course_specifications_owner_organization_id_fkey','owner_organization_id'),
    ('commercial_contract_parties','commercial_contract_parties_organization_id_fkey','organization_id'),
    ('competency_mastery_policies','competency_mastery_policies_owner_organization_id_fkey','owner_organization_id'),
    ('content_assets','content_assets_owner_organization_id_fkey','owner_organization_id'),
    ('curriculum_acquisitions','curriculum_acquisitions_acquired_by_organization_id_fkey','acquired_by_organization_id'),
    ('curriculum_acquisitions','curriculum_acquisitions_source_organization_id_fkey','source_organization_id'),
    ('curriculum_rights_grants','curriculum_rights_grants_licensee_organization_id_fkey','licensee_organization_id'),
    ('curriculum_rights_grants','curriculum_rights_grants_rightsholder_organization_id_fkey','rightsholder_organization_id'),
    ('deployment_organization_roles','deployment_organization_roles_organization_id_fkey','organization_id'),
    ('deployment_site_operating_terms','deployment_site_operating_terms_operating_organization_id_fkey','operating_organization_id'),
    ('enrollment_referral_sources','enrollment_referral_sources_source_organization_id_fkey','source_organization_id'),
    ('foundation_delivery_policies','foundation_delivery_policies_owner_organization_id_fkey','owner_organization_id'),
    ('foundation_families','foundation_families_owner_organization_id_fkey','owner_organization_id'),
    ('foundation_modules','foundation_modules_owner_organization_id_fkey','owner_organization_id'),
    ('funding_eligibility_requirements','funding_eligibility_requireme_verifying_authority_organiza_fkey','verifying_authority_organization_id'),
    ('funding_opportunities','funding_opportunities_funder_organization_id_fkey','funder_organization_id'),
    ('legal_sources','legal_sources_issuer_organization_id_fkey','issuer_organization_id'),
    ('offering_entitlements','offering_entitlements_organization_id_fkey','organization_id'),
    ('organization_classifications','organization_classifications_organization_id_fkey','organization_id'),
    ('organization_relationships','organization_relationships_from_organization_id_fkey','from_organization_id'),
    ('organization_relationships','organization_relationships_to_organization_id_fkey','to_organization_id'),
    ('production_opportunities','production_opportunities_commissioning_organization_id_fkey','commissioning_organization_id'),
    ('professional_service_offerings','professional_service_offerings_provider_organization_id_fkey','provider_organization_id'),
    ('provider_authorizations','provider_authorizations_provider_organization_id_fkey','provider_organization_id'),
    ('provider_eligibility_reviews','provider_eligibility_reviews_provider_organization_id_fkey','provider_organization_id'),
    ('school_graduation_requirement_versions','school_graduation_requirement_v_adopted_by_organization_id_fkey','adopted_by_organization_id')
 ) AS selected(table_name,constraint_name,column_name) LOOP
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.organizations(id)',
    item.table_name,item.constraint_name,item.constraint_name,item.column_name);
 END LOOP;
END $migrate$;
DO $verify$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('academic_course_specifications','academic_course_specifications_owner_organization_id_fkey','owner_organization_id'),
    ('commercial_contract_parties','commercial_contract_parties_organization_id_fkey','organization_id'),
    ('competency_mastery_policies','competency_mastery_policies_owner_organization_id_fkey','owner_organization_id'),
    ('content_assets','content_assets_owner_organization_id_fkey','owner_organization_id'),
    ('curriculum_acquisitions','curriculum_acquisitions_acquired_by_organization_id_fkey','acquired_by_organization_id'),
    ('curriculum_acquisitions','curriculum_acquisitions_source_organization_id_fkey','source_organization_id'),
    ('curriculum_rights_grants','curriculum_rights_grants_licensee_organization_id_fkey','licensee_organization_id'),
    ('curriculum_rights_grants','curriculum_rights_grants_rightsholder_organization_id_fkey','rightsholder_organization_id'),
    ('deployment_organization_roles','deployment_organization_roles_organization_id_fkey','organization_id'),
    ('deployment_site_operating_terms','deployment_site_operating_terms_operating_organization_id_fkey','operating_organization_id'),
    ('enrollment_referral_sources','enrollment_referral_sources_source_organization_id_fkey','source_organization_id'),
    ('foundation_delivery_policies','foundation_delivery_policies_owner_organization_id_fkey','owner_organization_id'),
    ('foundation_families','foundation_families_owner_organization_id_fkey','owner_organization_id'),
    ('foundation_modules','foundation_modules_owner_organization_id_fkey','owner_organization_id'),
    ('funding_eligibility_requirements','funding_eligibility_requireme_verifying_authority_organiza_fkey','verifying_authority_organization_id'),
    ('funding_opportunities','funding_opportunities_funder_organization_id_fkey','funder_organization_id'),
    ('legal_sources','legal_sources_issuer_organization_id_fkey','issuer_organization_id'),
    ('offering_entitlements','offering_entitlements_organization_id_fkey','organization_id'),
    ('organization_classifications','organization_classifications_organization_id_fkey','organization_id'),
    ('organization_relationships','organization_relationships_from_organization_id_fkey','from_organization_id'),
    ('organization_relationships','organization_relationships_to_organization_id_fkey','to_organization_id'),
    ('production_opportunities','production_opportunities_commissioning_organization_id_fkey','commissioning_organization_id'),
    ('professional_service_offerings','professional_service_offerings_provider_organization_id_fkey','provider_organization_id'),
    ('provider_authorizations','provider_authorizations_provider_organization_id_fkey','provider_organization_id'),
    ('provider_eligibility_reviews','provider_eligibility_reviews_provider_organization_id_fkey','provider_organization_id'),
    ('school_graduation_requirement_versions','school_graduation_requirement_v_adopted_by_organization_id_fkey','adopted_by_organization_id')
 ) AS selected(table_name,constraint_name,column_name) LOOP
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.'||item.table_name)
      AND c.conname=item.constraint_name
      AND c.contype='f' AND c.convalidated
      AND c.confrelid='public.organizations'::regclass
  ) THEN RAISE EXCEPTION 'Organization FK cutover failed: %',item.constraint_name; END IF;
 END LOOP;
END $verify$;
COMMIT;
