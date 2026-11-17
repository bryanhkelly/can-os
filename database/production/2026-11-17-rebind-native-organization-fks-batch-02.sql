-- CAN OS main: batch 2: 30 remaining empty native Organization FKs.
-- Each table verified empty, exact constraint definition and existing
-- Organization UUIDs matched to the authoritative public Organization.
-- No bridge, copies, grants or row-level security changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $guard$
DECLARE item record; previous text; rows_remaining bigint; unmatched bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing non-main branch'; END IF;
 SELECT count(*) INTO unmatched FROM education_v30.organizations n
 LEFT JOIN public.organizations p ON p.id=n.id WHERE p.id IS NULL;
 IF unmatched<>0 THEN RAISE EXCEPTION 'Canonical Organization has no shared UUID'; END IF;
 FOR item IN SELECT * FROM (VALUES
    ('deployment_readiness_evidence_checks','deployment_readiness_evidence_ch_verifying_organization_id_fkey','verifying_organization_id',''),
    ('education_initiatives','education_initiatives_sponsor_organization_id_fkey','sponsor_organization_id',''),
    ('education_service_evidence','education_service_evidence_provider_organization_id_fkey','provider_organization_id',''),
    ('eligible_operating_costs','eligible_operating_costs_paying_organization_id_fkey','paying_organization_id',''),
    ('enrollment_prospects','enrollment_prospects_owning_organization_id_fkey','owning_organization_id',''),
    ('equipment_acquisitions','equipment_acquisitions_acquiring_organization_id_fkey','acquiring_organization_id',''),
    ('equipment_acquisitions','equipment_acquisitions_donor_organization_id_fkey','donor_organization_id',''),
    ('equipment_assets','equipment_assets_inventory_organization_id_fkey','inventory_organization_id',''),
    ('equipment_assignments','equipment_assignments_assigned_organization_id_fkey','assigned_organization_id',''),
    ('equipment_custody_events','equipment_custody_events_from_organization_id_fkey','from_organization_id',''),
    ('equipment_custody_events','equipment_custody_events_to_organization_id_fkey','to_organization_id',''),
    ('equipment_ownership_periods','equipment_ownership_periods_owner_organization_id_fkey','owner_organization_id',''),
    ('equipment_service_events','equipment_service_events_provider_organization_id_fkey','provider_organization_id',''),
    ('evidence_documents','evidence_documents_owning_organization_id_fkey','owning_organization_id',''),
    ('experience_standards','experience_standards_owner_organization_id_fkey','owner_organization_id',''),
    ('facilitated_classroom_plans','facilitated_classroom_plans_host_organization_id_fkey','host_organization_id',''),
    ('facilitated_learning_sessions','facilitated_rooms_host_fk','host_organization_id',''),
    ('feedback_items','feedback_items_owner_organization_id_fkey','owner_organization_id',''),
    ('feedback_subjects','feedback_subjects_organization_id_fkey','organization_id',''),
    ('foundation_distribution_rights','foundation_distribution_rights_grantee_organization_id_fkey','grantee_organization_id',''),
    ('foundation_distribution_rights','foundation_distribution_rights_grantor_organization_id_fkey','grantor_organization_id',''),
    ('foundation_instructional_releases','foundation_instructional_releases_producer_organization_id_fkey','producer_organization_id',''),
    ('foundation_program_adoptions','foundation_program_adoptions_adopting_organization_id_fkey','adopting_organization_id',''),
    ('foundations','foundations_owner_organization_id_fkey','owner_organization_id',''),
    ('founding_development_commitments','founding_development_commitmen_contributor_organization_id_fkey','contributor_organization_id',''),
    ('founding_development_commitments','founding_development_commitments_recipient_organization_id_fkey','recipient_organization_id',''),
    ('framework_competency_reuse_authorizations','framework_competency_reuse_aut_authorizing_organization_id_fkey','authorizing_organization_id',''),
    ('funded_partner_service_terms','funded_partner_service_terms_service_provider_organization_fkey','service_provider_organization_id',''),
    ('funding_application_partners','funding_application_partners_organization_id_fkey','organization_id',''),
    ('funding_applications','funding_applications_applicant_organization_id_fkey','applicant_organization_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix)
 LOOP
  SELECT pg_get_constraintdef(c.oid) INTO previous FROM pg_constraint c
  WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable
    AND c.conrelid=to_regclass('education_v30.'||item.table_name)
    AND c.confrelid='education_v30.organizations'::regclass
    AND c.conname=item.constraint_name;
  IF previous IS DISTINCT FROM ('FOREIGN KEY ('||item.column_name||
      ') REFERENCES education_v30.organizations(id)'||item.delete_suffix)
  THEN RAISE EXCEPTION 'Unexpected FK shape: %',item.constraint_name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',item.table_name) INTO rows_remaining;
  IF rows_remaining<>0 THEN RAISE EXCEPTION 'Operational table populated: %',item.table_name; END IF;
 END LOOP;
END $guard$;
DO $migrate$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('deployment_readiness_evidence_checks','deployment_readiness_evidence_ch_verifying_organization_id_fkey','verifying_organization_id',''),
    ('education_initiatives','education_initiatives_sponsor_organization_id_fkey','sponsor_organization_id',''),
    ('education_service_evidence','education_service_evidence_provider_organization_id_fkey','provider_organization_id',''),
    ('eligible_operating_costs','eligible_operating_costs_paying_organization_id_fkey','paying_organization_id',''),
    ('enrollment_prospects','enrollment_prospects_owning_organization_id_fkey','owning_organization_id',''),
    ('equipment_acquisitions','equipment_acquisitions_acquiring_organization_id_fkey','acquiring_organization_id',''),
    ('equipment_acquisitions','equipment_acquisitions_donor_organization_id_fkey','donor_organization_id',''),
    ('equipment_assets','equipment_assets_inventory_organization_id_fkey','inventory_organization_id',''),
    ('equipment_assignments','equipment_assignments_assigned_organization_id_fkey','assigned_organization_id',''),
    ('equipment_custody_events','equipment_custody_events_from_organization_id_fkey','from_organization_id',''),
    ('equipment_custody_events','equipment_custody_events_to_organization_id_fkey','to_organization_id',''),
    ('equipment_ownership_periods','equipment_ownership_periods_owner_organization_id_fkey','owner_organization_id',''),
    ('equipment_service_events','equipment_service_events_provider_organization_id_fkey','provider_organization_id',''),
    ('evidence_documents','evidence_documents_owning_organization_id_fkey','owning_organization_id',''),
    ('experience_standards','experience_standards_owner_organization_id_fkey','owner_organization_id',''),
    ('facilitated_classroom_plans','facilitated_classroom_plans_host_organization_id_fkey','host_organization_id',''),
    ('facilitated_learning_sessions','facilitated_rooms_host_fk','host_organization_id',''),
    ('feedback_items','feedback_items_owner_organization_id_fkey','owner_organization_id',''),
    ('feedback_subjects','feedback_subjects_organization_id_fkey','organization_id',''),
    ('foundation_distribution_rights','foundation_distribution_rights_grantee_organization_id_fkey','grantee_organization_id',''),
    ('foundation_distribution_rights','foundation_distribution_rights_grantor_organization_id_fkey','grantor_organization_id',''),
    ('foundation_instructional_releases','foundation_instructional_releases_producer_organization_id_fkey','producer_organization_id',''),
    ('foundation_program_adoptions','foundation_program_adoptions_adopting_organization_id_fkey','adopting_organization_id',''),
    ('foundations','foundations_owner_organization_id_fkey','owner_organization_id',''),
    ('founding_development_commitments','founding_development_commitmen_contributor_organization_id_fkey','contributor_organization_id',''),
    ('founding_development_commitments','founding_development_commitments_recipient_organization_id_fkey','recipient_organization_id',''),
    ('framework_competency_reuse_authorizations','framework_competency_reuse_aut_authorizing_organization_id_fkey','authorizing_organization_id',''),
    ('funded_partner_service_terms','funded_partner_service_terms_service_provider_organization_fkey','service_provider_organization_id',''),
    ('funding_application_partners','funding_application_partners_organization_id_fkey','organization_id',''),
    ('funding_applications','funding_applications_applicant_organization_id_fkey','applicant_organization_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix)
 LOOP
  EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.organizations(id)%s',
    item.table_name,item.constraint_name,item.constraint_name,item.column_name,item.delete_suffix);
 END LOOP;
END $migrate$;
DO $verify$
DECLARE item record; definition text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('deployment_readiness_evidence_checks','deployment_readiness_evidence_ch_verifying_organization_id_fkey','verifying_organization_id',''),
    ('education_initiatives','education_initiatives_sponsor_organization_id_fkey','sponsor_organization_id',''),
    ('education_service_evidence','education_service_evidence_provider_organization_id_fkey','provider_organization_id',''),
    ('eligible_operating_costs','eligible_operating_costs_paying_organization_id_fkey','paying_organization_id',''),
    ('enrollment_prospects','enrollment_prospects_owning_organization_id_fkey','owning_organization_id',''),
    ('equipment_acquisitions','equipment_acquisitions_acquiring_organization_id_fkey','acquiring_organization_id',''),
    ('equipment_acquisitions','equipment_acquisitions_donor_organization_id_fkey','donor_organization_id',''),
    ('equipment_assets','equipment_assets_inventory_organization_id_fkey','inventory_organization_id',''),
    ('equipment_assignments','equipment_assignments_assigned_organization_id_fkey','assigned_organization_id',''),
    ('equipment_custody_events','equipment_custody_events_from_organization_id_fkey','from_organization_id',''),
    ('equipment_custody_events','equipment_custody_events_to_organization_id_fkey','to_organization_id',''),
    ('equipment_ownership_periods','equipment_ownership_periods_owner_organization_id_fkey','owner_organization_id',''),
    ('equipment_service_events','equipment_service_events_provider_organization_id_fkey','provider_organization_id',''),
    ('evidence_documents','evidence_documents_owning_organization_id_fkey','owning_organization_id',''),
    ('experience_standards','experience_standards_owner_organization_id_fkey','owner_organization_id',''),
    ('facilitated_classroom_plans','facilitated_classroom_plans_host_organization_id_fkey','host_organization_id',''),
    ('facilitated_learning_sessions','facilitated_rooms_host_fk','host_organization_id',''),
    ('feedback_items','feedback_items_owner_organization_id_fkey','owner_organization_id',''),
    ('feedback_subjects','feedback_subjects_organization_id_fkey','organization_id',''),
    ('foundation_distribution_rights','foundation_distribution_rights_grantee_organization_id_fkey','grantee_organization_id',''),
    ('foundation_distribution_rights','foundation_distribution_rights_grantor_organization_id_fkey','grantor_organization_id',''),
    ('foundation_instructional_releases','foundation_instructional_releases_producer_organization_id_fkey','producer_organization_id',''),
    ('foundation_program_adoptions','foundation_program_adoptions_adopting_organization_id_fkey','adopting_organization_id',''),
    ('foundations','foundations_owner_organization_id_fkey','owner_organization_id',''),
    ('founding_development_commitments','founding_development_commitmen_contributor_organization_id_fkey','contributor_organization_id',''),
    ('founding_development_commitments','founding_development_commitments_recipient_organization_id_fkey','recipient_organization_id',''),
    ('framework_competency_reuse_authorizations','framework_competency_reuse_aut_authorizing_organization_id_fkey','authorizing_organization_id',''),
    ('funded_partner_service_terms','funded_partner_service_terms_service_provider_organization_fkey','service_provider_organization_id',''),
    ('funding_application_partners','funding_application_partners_organization_id_fkey','organization_id',''),
    ('funding_applications','funding_applications_applicant_organization_id_fkey','applicant_organization_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix)
 LOOP
  SELECT pg_get_constraintdef(c.oid) INTO definition FROM pg_constraint c
  WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable
    AND c.conrelid=to_regclass('education_v30.'||item.table_name)
    AND c.confrelid='public.organizations'::regclass
    AND c.conname=item.constraint_name;
  IF definition IS DISTINCT FROM
    ('FOREIGN KEY ('||item.column_name||') REFERENCES organizations(id)'||item.delete_suffix)
  THEN RAISE EXCEPTION 'Failed to rebind: %',item.constraint_name; END IF;
 END LOOP;
END $verify$;
COMMIT;
