-- CAN OS main: batch 4: 30 remaining empty native Organization FKs.
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
    ('operational_authorization_decisions','operational_authorization_decisi_authority_organization_id_fkey','authority_organization_id',''),
    ('operator_rollout_applications','operator_rollout_applications_operating_organization_id_fkey','operating_organization_id',''),
    ('partner_compensation_terms','partner_compensation_terms_payee_organization_id_fkey','payee_organization_id',''),
    ('partner_payables','partner_payables_payee_organization_id_fkey','payee_organization_id',''),
    ('partnership_economic_targets','partnership_economic_targets_organization_id_fkey','organization_id',''),
    ('person_access_grants','person_access_grants_organization_id_fkey','organization_id',''),
    ('professional_capability_authorizations','professional_capability_authoriz_approving_organization_id_fkey','approving_organization_id',''),
    ('professional_qualifications','professional_qualifications_issued_by_organization_id_fkey','issued_by_organization_id',''),
    ('professional_role_assignments','professional_role_assignments_appointing_organization_id_fkey','appointing_organization_id',''),
    ('professional_role_assignments','professional_role_assignments_organization_id_fkey','organization_id',''),
    ('professional_screening_decisions','professional_screening_decisions_scope_organization_id_fkey','scope_organization_id',''),
    ('professional_service_engagements','professional_service_engagemen_contracting_organization_id_fkey','contracting_organization_id',''),
    ('program_readiness_policy_adoptions','program_readiness_policy_adoption_adopting_organization_id_fkey','adopting_organization_id',''),
    ('publisher_rollout_plans','publisher_rollout_plans_publisher_organization_id_fkey','publisher_organization_id',''),
    ('qualification_applications','qualification_applications_applicant_organization_id_fkey','applicant_organization_id',''),
    ('qualification_definitions','qualification_definitions_owner_organization_id_fkey','owner_organization_id',''),
    ('qualification_evidence_access_grants','qualification_evidence_access_gran_grantee_organization_id_fkey','grantee_organization_id',''),
    ('qualification_evidence_access_grants','qualification_evidence_access_gran_grantor_organization_id_fkey','grantor_organization_id',''),
    ('qualification_network_reporting_grants','qualification_network_reporti_participating_organization_i_fkey','participating_organization_id',''),
    ('qualification_operational_gates','qualification_operational_gates_adopting_organization_id_fkey','adopting_organization_id',''),
    ('qualification_person_consents','qualification_person_consents_applicant_organization_id_fkey','applicant_organization_id',''),
    ('qualification_program_fit_policies','qualification_program_fit_policies_owner_organization_id_fkey','owner_organization_id',''),
    ('qualification_program_fit_reviewer_authorizations','qualification_program_fit_revi_authorizing_organization_id_fkey','authorizing_organization_id',''),
    ('qualification_proposed_sites','qualification_proposed_sites_proposing_organization_id_fkey','proposing_organization_id',''),
    ('qualification_reviewer_authorizations','qualification_reviewer_authori_authorizing_organization_id_fkey','authorizing_organization_id',''),
    ('qualification_reviewer_authorizations','qualification_reviewer_authorizat_reviewer_organization_id_fkey','reviewer_organization_id',''),
    ('qualification_subjects','qualification_subjects_applicant_organization_id_fkey','applicant_organization_id',''),
    ('qualification_subjects','qualification_subjects_organization_id_fkey','organization_id',''),
    ('quality_evaluations','quality_evaluations_reviewing_organization_id_fkey','reviewing_organization_id',''),
    ('readiness_evaluations','readiness_evaluations_deciding_organization_id_fkey','deciding_organization_id','')
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
    ('operational_authorization_decisions','operational_authorization_decisi_authority_organization_id_fkey','authority_organization_id',''),
    ('operator_rollout_applications','operator_rollout_applications_operating_organization_id_fkey','operating_organization_id',''),
    ('partner_compensation_terms','partner_compensation_terms_payee_organization_id_fkey','payee_organization_id',''),
    ('partner_payables','partner_payables_payee_organization_id_fkey','payee_organization_id',''),
    ('partnership_economic_targets','partnership_economic_targets_organization_id_fkey','organization_id',''),
    ('person_access_grants','person_access_grants_organization_id_fkey','organization_id',''),
    ('professional_capability_authorizations','professional_capability_authoriz_approving_organization_id_fkey','approving_organization_id',''),
    ('professional_qualifications','professional_qualifications_issued_by_organization_id_fkey','issued_by_organization_id',''),
    ('professional_role_assignments','professional_role_assignments_appointing_organization_id_fkey','appointing_organization_id',''),
    ('professional_role_assignments','professional_role_assignments_organization_id_fkey','organization_id',''),
    ('professional_screening_decisions','professional_screening_decisions_scope_organization_id_fkey','scope_organization_id',''),
    ('professional_service_engagements','professional_service_engagemen_contracting_organization_id_fkey','contracting_organization_id',''),
    ('program_readiness_policy_adoptions','program_readiness_policy_adoption_adopting_organization_id_fkey','adopting_organization_id',''),
    ('publisher_rollout_plans','publisher_rollout_plans_publisher_organization_id_fkey','publisher_organization_id',''),
    ('qualification_applications','qualification_applications_applicant_organization_id_fkey','applicant_organization_id',''),
    ('qualification_definitions','qualification_definitions_owner_organization_id_fkey','owner_organization_id',''),
    ('qualification_evidence_access_grants','qualification_evidence_access_gran_grantee_organization_id_fkey','grantee_organization_id',''),
    ('qualification_evidence_access_grants','qualification_evidence_access_gran_grantor_organization_id_fkey','grantor_organization_id',''),
    ('qualification_network_reporting_grants','qualification_network_reporti_participating_organization_i_fkey','participating_organization_id',''),
    ('qualification_operational_gates','qualification_operational_gates_adopting_organization_id_fkey','adopting_organization_id',''),
    ('qualification_person_consents','qualification_person_consents_applicant_organization_id_fkey','applicant_organization_id',''),
    ('qualification_program_fit_policies','qualification_program_fit_policies_owner_organization_id_fkey','owner_organization_id',''),
    ('qualification_program_fit_reviewer_authorizations','qualification_program_fit_revi_authorizing_organization_id_fkey','authorizing_organization_id',''),
    ('qualification_proposed_sites','qualification_proposed_sites_proposing_organization_id_fkey','proposing_organization_id',''),
    ('qualification_reviewer_authorizations','qualification_reviewer_authori_authorizing_organization_id_fkey','authorizing_organization_id',''),
    ('qualification_reviewer_authorizations','qualification_reviewer_authorizat_reviewer_organization_id_fkey','reviewer_organization_id',''),
    ('qualification_subjects','qualification_subjects_applicant_organization_id_fkey','applicant_organization_id',''),
    ('qualification_subjects','qualification_subjects_organization_id_fkey','organization_id',''),
    ('quality_evaluations','quality_evaluations_reviewing_organization_id_fkey','reviewing_organization_id',''),
    ('readiness_evaluations','readiness_evaluations_deciding_organization_id_fkey','deciding_organization_id','')
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
    ('operational_authorization_decisions','operational_authorization_decisi_authority_organization_id_fkey','authority_organization_id',''),
    ('operator_rollout_applications','operator_rollout_applications_operating_organization_id_fkey','operating_organization_id',''),
    ('partner_compensation_terms','partner_compensation_terms_payee_organization_id_fkey','payee_organization_id',''),
    ('partner_payables','partner_payables_payee_organization_id_fkey','payee_organization_id',''),
    ('partnership_economic_targets','partnership_economic_targets_organization_id_fkey','organization_id',''),
    ('person_access_grants','person_access_grants_organization_id_fkey','organization_id',''),
    ('professional_capability_authorizations','professional_capability_authoriz_approving_organization_id_fkey','approving_organization_id',''),
    ('professional_qualifications','professional_qualifications_issued_by_organization_id_fkey','issued_by_organization_id',''),
    ('professional_role_assignments','professional_role_assignments_appointing_organization_id_fkey','appointing_organization_id',''),
    ('professional_role_assignments','professional_role_assignments_organization_id_fkey','organization_id',''),
    ('professional_screening_decisions','professional_screening_decisions_scope_organization_id_fkey','scope_organization_id',''),
    ('professional_service_engagements','professional_service_engagemen_contracting_organization_id_fkey','contracting_organization_id',''),
    ('program_readiness_policy_adoptions','program_readiness_policy_adoption_adopting_organization_id_fkey','adopting_organization_id',''),
    ('publisher_rollout_plans','publisher_rollout_plans_publisher_organization_id_fkey','publisher_organization_id',''),
    ('qualification_applications','qualification_applications_applicant_organization_id_fkey','applicant_organization_id',''),
    ('qualification_definitions','qualification_definitions_owner_organization_id_fkey','owner_organization_id',''),
    ('qualification_evidence_access_grants','qualification_evidence_access_gran_grantee_organization_id_fkey','grantee_organization_id',''),
    ('qualification_evidence_access_grants','qualification_evidence_access_gran_grantor_organization_id_fkey','grantor_organization_id',''),
    ('qualification_network_reporting_grants','qualification_network_reporti_participating_organization_i_fkey','participating_organization_id',''),
    ('qualification_operational_gates','qualification_operational_gates_adopting_organization_id_fkey','adopting_organization_id',''),
    ('qualification_person_consents','qualification_person_consents_applicant_organization_id_fkey','applicant_organization_id',''),
    ('qualification_program_fit_policies','qualification_program_fit_policies_owner_organization_id_fkey','owner_organization_id',''),
    ('qualification_program_fit_reviewer_authorizations','qualification_program_fit_revi_authorizing_organization_id_fkey','authorizing_organization_id',''),
    ('qualification_proposed_sites','qualification_proposed_sites_proposing_organization_id_fkey','proposing_organization_id',''),
    ('qualification_reviewer_authorizations','qualification_reviewer_authori_authorizing_organization_id_fkey','authorizing_organization_id',''),
    ('qualification_reviewer_authorizations','qualification_reviewer_authorizat_reviewer_organization_id_fkey','reviewer_organization_id',''),
    ('qualification_subjects','qualification_subjects_applicant_organization_id_fkey','applicant_organization_id',''),
    ('qualification_subjects','qualification_subjects_organization_id_fkey','organization_id',''),
    ('quality_evaluations','quality_evaluations_reviewing_organization_id_fkey','reviewing_organization_id',''),
    ('readiness_evaluations','readiness_evaluations_deciding_organization_id_fkey','deciding_organization_id','')
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
