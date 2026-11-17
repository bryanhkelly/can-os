-- CAN OS main: batch 3: 30 remaining empty native Organization FKs.
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
    ('funding_awards','funding_awards_recipient_organization_id_fkey','recipient_organization_id',''),
    ('funding_disbursements','funding_disbursements_receiver_organization_id_fkey','receiver_organization_id',''),
    ('funding_programs','funding_programs_sponsoring_organization_id_fkey','sponsoring_organization_id',''),
    ('governance_exceptions','governance_exceptions_requested_by_organization_id_fkey','requested_by_organization_id',''),
    ('governance_policies','governance_policies_owner_organization_id_fkey','owner_organization_id',''),
    ('governance_policy_adoptions','governance_policy_adoptions_adopting_organization_id_fkey','adopting_organization_id',''),
    ('governance_policy_scopes','governance_policy_scopes_organization_id_fkey','organization_id',''),
    ('grading_assignments','grading_assignments_appointing_organization_id_fkey','appointing_organization_id',''),
    ('graduation_decisions','graduation_decisions_issuing_organization_id_fkey','issuing_organization_id',''),
    ('improvement_actions','improvement_actions_assigned_organization_id_fkey','assigned_organization_id',''),
    ('improvement_plans','improvement_plans_accountable_organization_id_fkey','accountable_organization_id',''),
    ('initiative_deployments','initiative_deployments_participating_organization_id_fkey','participating_organization_id',''),
    ('initiative_partner_roles','initiative_partner_roles_organization_id_fkey','organization_id',''),
    ('learner_benefit_entitlements','learner_benefit_entitlements_approving_authority_id_fkey','approving_authority_id',''),
    ('learner_competency_determinations','learner_competency_determinati_determining_organization_id_fkey','determining_organization_id',''),
    ('learner_data_disclosures','learner_data_disclosures_recipient_organization_id_fkey','recipient_organization_id',''),
    ('learner_outcomes','learner_outcomes_authority_organization_id_fkey','authority_organization_id',''),
    ('learning_award_definitions','learning_award_definitions_issuer_organization_id_fkey','issuer_organization_id',''),
    ('learning_award_issuances','learning_award_issuances_issuer_organization_id_fkey','issuer_organization_id',''),
    ('learning_completion_evidence_bindings','learning_completion_evidence_bind_provider_organization_id_fkey','provider_organization_id',''),
    ('learning_completion_evidence_review_requests','learning_completion_evidence_revi_provider_organization_id_fkey','provider_organization_id',''),
    ('metric_observations','metric_observations_observing_organization_id_fkey','observing_organization_id',''),
    ('network_governance_delegations','network_governance_delegations_delegate_organization_id_fkey','delegate_organization_id',''),
    ('network_governance_delegations','network_governance_delegations_delegator_organization_id_fkey','delegator_organization_id',''),
    ('network_member_identifiers','network_member_identifiers_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('network_units','network_units_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_completion_certificates','noncredit_completion_certificates_issuer_organization_id_fkey','issuer_organization_id',''),
    ('official_authorization_scopes','official_authorization_scopes_organization_id_fkey','organization_id',''),
    ('official_authorizations','official_authorizations_issuing_authority_id_fkey','issuing_authority_id',''),
    ('official_course_grades','official_course_grades_issuer_organization_id_fkey','issuer_organization_id','')
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
    ('funding_awards','funding_awards_recipient_organization_id_fkey','recipient_organization_id',''),
    ('funding_disbursements','funding_disbursements_receiver_organization_id_fkey','receiver_organization_id',''),
    ('funding_programs','funding_programs_sponsoring_organization_id_fkey','sponsoring_organization_id',''),
    ('governance_exceptions','governance_exceptions_requested_by_organization_id_fkey','requested_by_organization_id',''),
    ('governance_policies','governance_policies_owner_organization_id_fkey','owner_organization_id',''),
    ('governance_policy_adoptions','governance_policy_adoptions_adopting_organization_id_fkey','adopting_organization_id',''),
    ('governance_policy_scopes','governance_policy_scopes_organization_id_fkey','organization_id',''),
    ('grading_assignments','grading_assignments_appointing_organization_id_fkey','appointing_organization_id',''),
    ('graduation_decisions','graduation_decisions_issuing_organization_id_fkey','issuing_organization_id',''),
    ('improvement_actions','improvement_actions_assigned_organization_id_fkey','assigned_organization_id',''),
    ('improvement_plans','improvement_plans_accountable_organization_id_fkey','accountable_organization_id',''),
    ('initiative_deployments','initiative_deployments_participating_organization_id_fkey','participating_organization_id',''),
    ('initiative_partner_roles','initiative_partner_roles_organization_id_fkey','organization_id',''),
    ('learner_benefit_entitlements','learner_benefit_entitlements_approving_authority_id_fkey','approving_authority_id',''),
    ('learner_competency_determinations','learner_competency_determinati_determining_organization_id_fkey','determining_organization_id',''),
    ('learner_data_disclosures','learner_data_disclosures_recipient_organization_id_fkey','recipient_organization_id',''),
    ('learner_outcomes','learner_outcomes_authority_organization_id_fkey','authority_organization_id',''),
    ('learning_award_definitions','learning_award_definitions_issuer_organization_id_fkey','issuer_organization_id',''),
    ('learning_award_issuances','learning_award_issuances_issuer_organization_id_fkey','issuer_organization_id',''),
    ('learning_completion_evidence_bindings','learning_completion_evidence_bind_provider_organization_id_fkey','provider_organization_id',''),
    ('learning_completion_evidence_review_requests','learning_completion_evidence_revi_provider_organization_id_fkey','provider_organization_id',''),
    ('metric_observations','metric_observations_observing_organization_id_fkey','observing_organization_id',''),
    ('network_governance_delegations','network_governance_delegations_delegate_organization_id_fkey','delegate_organization_id',''),
    ('network_governance_delegations','network_governance_delegations_delegator_organization_id_fkey','delegator_organization_id',''),
    ('network_member_identifiers','network_member_identifiers_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('network_units','network_units_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_completion_certificates','noncredit_completion_certificates_issuer_organization_id_fkey','issuer_organization_id',''),
    ('official_authorization_scopes','official_authorization_scopes_organization_id_fkey','organization_id',''),
    ('official_authorizations','official_authorizations_issuing_authority_id_fkey','issuing_authority_id',''),
    ('official_course_grades','official_course_grades_issuer_organization_id_fkey','issuer_organization_id','')
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
    ('funding_awards','funding_awards_recipient_organization_id_fkey','recipient_organization_id',''),
    ('funding_disbursements','funding_disbursements_receiver_organization_id_fkey','receiver_organization_id',''),
    ('funding_programs','funding_programs_sponsoring_organization_id_fkey','sponsoring_organization_id',''),
    ('governance_exceptions','governance_exceptions_requested_by_organization_id_fkey','requested_by_organization_id',''),
    ('governance_policies','governance_policies_owner_organization_id_fkey','owner_organization_id',''),
    ('governance_policy_adoptions','governance_policy_adoptions_adopting_organization_id_fkey','adopting_organization_id',''),
    ('governance_policy_scopes','governance_policy_scopes_organization_id_fkey','organization_id',''),
    ('grading_assignments','grading_assignments_appointing_organization_id_fkey','appointing_organization_id',''),
    ('graduation_decisions','graduation_decisions_issuing_organization_id_fkey','issuing_organization_id',''),
    ('improvement_actions','improvement_actions_assigned_organization_id_fkey','assigned_organization_id',''),
    ('improvement_plans','improvement_plans_accountable_organization_id_fkey','accountable_organization_id',''),
    ('initiative_deployments','initiative_deployments_participating_organization_id_fkey','participating_organization_id',''),
    ('initiative_partner_roles','initiative_partner_roles_organization_id_fkey','organization_id',''),
    ('learner_benefit_entitlements','learner_benefit_entitlements_approving_authority_id_fkey','approving_authority_id',''),
    ('learner_competency_determinations','learner_competency_determinati_determining_organization_id_fkey','determining_organization_id',''),
    ('learner_data_disclosures','learner_data_disclosures_recipient_organization_id_fkey','recipient_organization_id',''),
    ('learner_outcomes','learner_outcomes_authority_organization_id_fkey','authority_organization_id',''),
    ('learning_award_definitions','learning_award_definitions_issuer_organization_id_fkey','issuer_organization_id',''),
    ('learning_award_issuances','learning_award_issuances_issuer_organization_id_fkey','issuer_organization_id',''),
    ('learning_completion_evidence_bindings','learning_completion_evidence_bind_provider_organization_id_fkey','provider_organization_id',''),
    ('learning_completion_evidence_review_requests','learning_completion_evidence_revi_provider_organization_id_fkey','provider_organization_id',''),
    ('metric_observations','metric_observations_observing_organization_id_fkey','observing_organization_id',''),
    ('network_governance_delegations','network_governance_delegations_delegate_organization_id_fkey','delegate_organization_id',''),
    ('network_governance_delegations','network_governance_delegations_delegator_organization_id_fkey','delegator_organization_id',''),
    ('network_member_identifiers','network_member_identifiers_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('network_units','network_units_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_completion_certificates','noncredit_completion_certificates_issuer_organization_id_fkey','issuer_organization_id',''),
    ('official_authorization_scopes','official_authorization_scopes_organization_id_fkey','organization_id',''),
    ('official_authorizations','official_authorizations_issuing_authority_id_fkey','issuing_authority_id',''),
    ('official_course_grades','official_course_grades_issuer_organization_id_fkey','issuer_organization_id','')
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
