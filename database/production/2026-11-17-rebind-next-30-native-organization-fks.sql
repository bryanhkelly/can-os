-- CAN OS main: first 30 remaining empty native Organization FKs.
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
    ('academic_credit_awards','academic_credit_awards_credit_issuer_organization_id_fkey','credit_issuer_organization_id',''),
    ('academic_frameworks','academic_frameworks_steward_organization_id_fkey','steward_organization_id',''),
    ('admission_offers','admission_offers_offered_by_organization_id_fkey','offered_by_organization_id',''),
    ('application_decisions','application_decisions_deciding_organization_id_fkey','deciding_organization_id',''),
    ('application_principal_grants','application_principal_grants_grantee_organization_id_fkey','grantee_organization_id',''),
    ('application_principals','application_principals_service_organization_id_fkey','service_organization_id',''),
    ('assessment_administrations','assessment_administrations_administering_organization_id_fkey','administering_organization_id',''),
    ('assessment_item_banks','assessment_item_banks_owner_organization_id_fkey','owner_organization_id',''),
    ('assessment_scoring_assignments','assessment_scoring_assignments_appointing_organization_id_fkey','appointing_organization_id',''),
    ('assurance_case_assignments','assurance_case_assignments_accountable_organization_id_fkey','accountable_organization_id',''),
    ('assurance_case_escalations','assurance_case_escalations_escalation_to_organization_id_fkey','escalation_to_organization_id',''),
    ('assurance_cases','assurance_cases_owning_organization_id_fkey','owning_organization_id',''),
    ('assurance_controls','assurance_controls_owner_organization_id_fkey','owner_organization_id',''),
    ('audit_events','audit_events_owning_organization_id_fkey','owning_organization_id',''),
    ('blueprint_component_approval_decisions','blueprint_component_approval_dec_authority_organization_id_fkey','authority_organization_id',''),
    ('blueprint_configurations','blueprint_configurations_owning_organization_id_fkey','owning_organization_id',''),
    ('blueprint_execution_batches','blueprint_execution_batches_executing_organization_id_fkey','executing_organization_id',''),
    ('class_awards','class_awards_issuing_organization_id_fkey','issuing_organization_id',''),
    ('competencies','competencies_owner_organization_id_fkey','owner_organization_id',''),
    ('connectivity_services','connectivity_services_provider_organization_id_fkey','provider_organization_id',''),
    ('connectivity_services','connectivity_services_responsible_organization_id_fkey','responsible_organization_id',''),
    ('content_publication_manifests','content_publication_manifests_owner_organization_id_fkey','owner_organization_id',''),
    ('contractual_milestones','contractual_milestones_responsible_organization_id_fkey','responsible_organization_id',''),
    ('control_evaluations','control_evaluations_evaluator_organization_id_fkey','evaluator_organization_id',''),
    ('control_obligations','control_obligations_accountable_organization_id_fkey','accountable_organization_id',''),
    ('creator_commissions','creator_commissions_contracting_organization_id_fkey','contracting_organization_id',''),
    ('credential_definitions','credential_definitions_issuing_organization_id_fkey','issuing_organization_id',''),
    ('credential_issuance_support','credential_issuance_support_issuing_organization_id_fkey','issuing_organization_id',''),
    ('database_role_organization_bindings','database_role_organization_bindings_organization_id_fkey','organization_id',''),
    ('deployment_operating_contexts','deployment_operating_contexts_approved_by_organization_id_fkey','approved_by_organization_id','')
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
    ('academic_credit_awards','academic_credit_awards_credit_issuer_organization_id_fkey','credit_issuer_organization_id',''),
    ('academic_frameworks','academic_frameworks_steward_organization_id_fkey','steward_organization_id',''),
    ('admission_offers','admission_offers_offered_by_organization_id_fkey','offered_by_organization_id',''),
    ('application_decisions','application_decisions_deciding_organization_id_fkey','deciding_organization_id',''),
    ('application_principal_grants','application_principal_grants_grantee_organization_id_fkey','grantee_organization_id',''),
    ('application_principals','application_principals_service_organization_id_fkey','service_organization_id',''),
    ('assessment_administrations','assessment_administrations_administering_organization_id_fkey','administering_organization_id',''),
    ('assessment_item_banks','assessment_item_banks_owner_organization_id_fkey','owner_organization_id',''),
    ('assessment_scoring_assignments','assessment_scoring_assignments_appointing_organization_id_fkey','appointing_organization_id',''),
    ('assurance_case_assignments','assurance_case_assignments_accountable_organization_id_fkey','accountable_organization_id',''),
    ('assurance_case_escalations','assurance_case_escalations_escalation_to_organization_id_fkey','escalation_to_organization_id',''),
    ('assurance_cases','assurance_cases_owning_organization_id_fkey','owning_organization_id',''),
    ('assurance_controls','assurance_controls_owner_organization_id_fkey','owner_organization_id',''),
    ('audit_events','audit_events_owning_organization_id_fkey','owning_organization_id',''),
    ('blueprint_component_approval_decisions','blueprint_component_approval_dec_authority_organization_id_fkey','authority_organization_id',''),
    ('blueprint_configurations','blueprint_configurations_owning_organization_id_fkey','owning_organization_id',''),
    ('blueprint_execution_batches','blueprint_execution_batches_executing_organization_id_fkey','executing_organization_id',''),
    ('class_awards','class_awards_issuing_organization_id_fkey','issuing_organization_id',''),
    ('competencies','competencies_owner_organization_id_fkey','owner_organization_id',''),
    ('connectivity_services','connectivity_services_provider_organization_id_fkey','provider_organization_id',''),
    ('connectivity_services','connectivity_services_responsible_organization_id_fkey','responsible_organization_id',''),
    ('content_publication_manifests','content_publication_manifests_owner_organization_id_fkey','owner_organization_id',''),
    ('contractual_milestones','contractual_milestones_responsible_organization_id_fkey','responsible_organization_id',''),
    ('control_evaluations','control_evaluations_evaluator_organization_id_fkey','evaluator_organization_id',''),
    ('control_obligations','control_obligations_accountable_organization_id_fkey','accountable_organization_id',''),
    ('creator_commissions','creator_commissions_contracting_organization_id_fkey','contracting_organization_id',''),
    ('credential_definitions','credential_definitions_issuing_organization_id_fkey','issuing_organization_id',''),
    ('credential_issuance_support','credential_issuance_support_issuing_organization_id_fkey','issuing_organization_id',''),
    ('database_role_organization_bindings','database_role_organization_bindings_organization_id_fkey','organization_id',''),
    ('deployment_operating_contexts','deployment_operating_contexts_approved_by_organization_id_fkey','approved_by_organization_id','')
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
    ('academic_credit_awards','academic_credit_awards_credit_issuer_organization_id_fkey','credit_issuer_organization_id',''),
    ('academic_frameworks','academic_frameworks_steward_organization_id_fkey','steward_organization_id',''),
    ('admission_offers','admission_offers_offered_by_organization_id_fkey','offered_by_organization_id',''),
    ('application_decisions','application_decisions_deciding_organization_id_fkey','deciding_organization_id',''),
    ('application_principal_grants','application_principal_grants_grantee_organization_id_fkey','grantee_organization_id',''),
    ('application_principals','application_principals_service_organization_id_fkey','service_organization_id',''),
    ('assessment_administrations','assessment_administrations_administering_organization_id_fkey','administering_organization_id',''),
    ('assessment_item_banks','assessment_item_banks_owner_organization_id_fkey','owner_organization_id',''),
    ('assessment_scoring_assignments','assessment_scoring_assignments_appointing_organization_id_fkey','appointing_organization_id',''),
    ('assurance_case_assignments','assurance_case_assignments_accountable_organization_id_fkey','accountable_organization_id',''),
    ('assurance_case_escalations','assurance_case_escalations_escalation_to_organization_id_fkey','escalation_to_organization_id',''),
    ('assurance_cases','assurance_cases_owning_organization_id_fkey','owning_organization_id',''),
    ('assurance_controls','assurance_controls_owner_organization_id_fkey','owner_organization_id',''),
    ('audit_events','audit_events_owning_organization_id_fkey','owning_organization_id',''),
    ('blueprint_component_approval_decisions','blueprint_component_approval_dec_authority_organization_id_fkey','authority_organization_id',''),
    ('blueprint_configurations','blueprint_configurations_owning_organization_id_fkey','owning_organization_id',''),
    ('blueprint_execution_batches','blueprint_execution_batches_executing_organization_id_fkey','executing_organization_id',''),
    ('class_awards','class_awards_issuing_organization_id_fkey','issuing_organization_id',''),
    ('competencies','competencies_owner_organization_id_fkey','owner_organization_id',''),
    ('connectivity_services','connectivity_services_provider_organization_id_fkey','provider_organization_id',''),
    ('connectivity_services','connectivity_services_responsible_organization_id_fkey','responsible_organization_id',''),
    ('content_publication_manifests','content_publication_manifests_owner_organization_id_fkey','owner_organization_id',''),
    ('contractual_milestones','contractual_milestones_responsible_organization_id_fkey','responsible_organization_id',''),
    ('control_evaluations','control_evaluations_evaluator_organization_id_fkey','evaluator_organization_id',''),
    ('control_obligations','control_obligations_accountable_organization_id_fkey','accountable_organization_id',''),
    ('creator_commissions','creator_commissions_contracting_organization_id_fkey','contracting_organization_id',''),
    ('credential_definitions','credential_definitions_issuing_organization_id_fkey','issuing_organization_id',''),
    ('credential_issuance_support','credential_issuance_support_issuing_organization_id_fkey','issuing_organization_id',''),
    ('database_role_organization_bindings','database_role_organization_bindings_organization_id_fkey','organization_id',''),
    ('deployment_operating_contexts','deployment_operating_contexts_approved_by_organization_id_fkey','approved_by_organization_id','')
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
