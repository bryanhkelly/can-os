-- CAN OS Neon main only, actor attribution batch 3.
-- No learner, guardian, account, session or reviewer grant identity changes.
-- Exact public Person UUIDs and existing ON DELETE restrictions preserved.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='100s';
DO $guard$
DECLARE x record; def text; invalid bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' THEN RAISE EXCEPTION 'Wrong Neon main'; END IF;
 IF to_regclass('education_v30.persons') IS NULL OR
 (SELECT count(*) FROM education_v30.persons)<>0
 THEN RAISE EXCEPTION 'Native Person identity has changed'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE contype='f'
 AND confrelid='education_v30.persons'::regclass)<>179
 THEN RAISE EXCEPTION 'Expected 179 native Person FKs before this batch'; END IF;
 FOR x IN SELECT * FROM (VALUES
    ('learning_completion_evidence_review_requests','learning_completion_evidence_review_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('network_member_identifiers','network_member_identifiers_verified_by_person_id_fkey','verified_by_person_id',' ON DELETE RESTRICT'),
    ('network_reporting_grants','network_reporting_grants_granted_by_person_id_fkey','granted_by_person_id',' ON DELETE RESTRICT'),
    ('network_reporting_memberships','network_reporting_memberships_reviewed_by_person_id_fkey','reviewed_by_person_id',' ON DELETE RESTRICT'),
    ('noncredit_completion_certificates','noncredit_completion_certificates_issued_by_person_id_fkey','issued_by_person_id',''),
    ('noncredit_completion_decisions','noncredit_completion_decisions_decided_by_person_id_fkey','decided_by_person_id',''),
    ('noncredit_completion_policies','noncredit_completion_policies_approved_by_person_id_fkey','approved_by_person_id',''),
    ('noncredit_participation_events','noncredit_participation_events_recorded_by_person_id_fkey','recorded_by_person_id',''),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_releases_published_by_person_id_fkey','published_by_person_id',' ON DELETE RESTRICT'),
    ('noncredit_training_versions','noncredit_training_versions_approved_by_person_id_fkey','approved_by_person_id',''),
    ('official_authorizations','official_authorizations_reviewed_by_person_id_fkey','reviewed_by_person_id',''),
    ('operation_publication_snapshots','operation_publication_snapshots_approved_by_person_id_fkey','approved_by_person_id',''),
    ('operator_rollout_class_links','operator_rollout_class_links_linked_by_person_id_fkey','linked_by_person_id',''),
    ('professional_capability_authorizations','professional_capability_authorizatio_approved_by_person_id_fkey','approved_by_person_id',''),
    ('professional_screening_decisions','professional_screening_decisions_decided_by_person_id_fkey','decided_by_person_id',''),
    ('professional_service_delivery_records','professional_service_delivery_record_verified_by_person_id_fkey','verified_by_person_id',''),
    ('program_applications','program_applications_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('program_publication_claims','program_publication_claims_reviewed_by_person_id_fkey','reviewed_by_person_id',''),
    ('program_readiness_policy_adoptions','program_readiness_policy_adoptions_approved_by_person_id_fkey','approved_by_person_id',''),
    ('publication_withdrawals','publication_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id',''),
    ('publisher_rollout_plans','publisher_rollout_plans_authored_by_person_id_fkey','authored_by_person_id',''),
    ('qualification_application_survey_submissions','qualification_application_survey_su_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('qualification_conditions','qualification_conditions_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_decisions','qualification_decisions_decided_by_person_id_fkey','decided_by_person_id',''),
    ('qualification_evidence_access_grants','qualification_evidence_access_grants_granted_by_person_id_fkey','granted_by_person_id',''),
    ('qualification_evidence_events','qualification_evidence_events_recorded_by_person_id_fkey','recorded_by_person_id',''),
    ('qualification_evidence_submissions','qualification_evidence_submissions_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('qualification_network_reporting_grants','qualification_network_reporting_gran_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_person_consent_withdrawals','qualification_person_consent_withdr_withdrawn_by_person_id_fkey','withdrawn_by_person_id',''),
    ('qualification_program_availability_rules','qualification_program_availability_r_reviewed_by_person_id_fkey','reviewed_by_person_id','')
) AS s(table_name,constraint_name,column_name,delete_suffix) LOOP
 SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
 WHERE conname=x.constraint_name AND contype='f' AND convalidated AND NOT condeferrable
 AND conrelid=to_regclass('education_v30.'||x.table_name)
 AND confrelid='education_v30.persons'::regclass;
 IF def IS DISTINCT FROM ('FOREIGN KEY ('||x.column_name||') REFERENCES education_v30.persons(id)'||x.delete_suffix)
 THEN RAISE EXCEPTION 'Unreviewed actor FK: %',x.constraint_name; END IF;
 EXECUTE format('SELECT count(*) FROM education_v30.%I r LEFT JOIN public.people p ON p.id=r.%I WHERE r.%I IS NOT NULL AND p.id IS NULL',x.table_name,x.column_name,x.column_name) INTO invalid;
 IF invalid<>0 THEN RAISE EXCEPTION 'Unmatched public Person actor: %',x.table_name; END IF;
 END LOOP;
END $guard$;
DO $move$
DECLARE x record;
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('learning_completion_evidence_review_requests','learning_completion_evidence_review_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('network_member_identifiers','network_member_identifiers_verified_by_person_id_fkey','verified_by_person_id',' ON DELETE RESTRICT'),
    ('network_reporting_grants','network_reporting_grants_granted_by_person_id_fkey','granted_by_person_id',' ON DELETE RESTRICT'),
    ('network_reporting_memberships','network_reporting_memberships_reviewed_by_person_id_fkey','reviewed_by_person_id',' ON DELETE RESTRICT'),
    ('noncredit_completion_certificates','noncredit_completion_certificates_issued_by_person_id_fkey','issued_by_person_id',''),
    ('noncredit_completion_decisions','noncredit_completion_decisions_decided_by_person_id_fkey','decided_by_person_id',''),
    ('noncredit_completion_policies','noncredit_completion_policies_approved_by_person_id_fkey','approved_by_person_id',''),
    ('noncredit_participation_events','noncredit_participation_events_recorded_by_person_id_fkey','recorded_by_person_id',''),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_releases_published_by_person_id_fkey','published_by_person_id',' ON DELETE RESTRICT'),
    ('noncredit_training_versions','noncredit_training_versions_approved_by_person_id_fkey','approved_by_person_id',''),
    ('official_authorizations','official_authorizations_reviewed_by_person_id_fkey','reviewed_by_person_id',''),
    ('operation_publication_snapshots','operation_publication_snapshots_approved_by_person_id_fkey','approved_by_person_id',''),
    ('operator_rollout_class_links','operator_rollout_class_links_linked_by_person_id_fkey','linked_by_person_id',''),
    ('professional_capability_authorizations','professional_capability_authorizatio_approved_by_person_id_fkey','approved_by_person_id',''),
    ('professional_screening_decisions','professional_screening_decisions_decided_by_person_id_fkey','decided_by_person_id',''),
    ('professional_service_delivery_records','professional_service_delivery_record_verified_by_person_id_fkey','verified_by_person_id',''),
    ('program_applications','program_applications_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('program_publication_claims','program_publication_claims_reviewed_by_person_id_fkey','reviewed_by_person_id',''),
    ('program_readiness_policy_adoptions','program_readiness_policy_adoptions_approved_by_person_id_fkey','approved_by_person_id',''),
    ('publication_withdrawals','publication_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id',''),
    ('publisher_rollout_plans','publisher_rollout_plans_authored_by_person_id_fkey','authored_by_person_id',''),
    ('qualification_application_survey_submissions','qualification_application_survey_su_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('qualification_conditions','qualification_conditions_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_decisions','qualification_decisions_decided_by_person_id_fkey','decided_by_person_id',''),
    ('qualification_evidence_access_grants','qualification_evidence_access_grants_granted_by_person_id_fkey','granted_by_person_id',''),
    ('qualification_evidence_events','qualification_evidence_events_recorded_by_person_id_fkey','recorded_by_person_id',''),
    ('qualification_evidence_submissions','qualification_evidence_submissions_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('qualification_network_reporting_grants','qualification_network_reporting_gran_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_person_consent_withdrawals','qualification_person_consent_withdr_withdrawn_by_person_id_fkey','withdrawn_by_person_id',''),
    ('qualification_program_availability_rules','qualification_program_availability_r_reviewed_by_person_id_fkey','reviewed_by_person_id','')
) AS s(table_name,constraint_name,column_name,delete_suffix) LOOP
 EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)%s',x.table_name,x.constraint_name,x.constraint_name,x.column_name,x.delete_suffix);
 END LOOP;
END $move$;
DO $verify$
DECLARE x record; left_count integer; definition text;
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('learning_completion_evidence_review_requests','learning_completion_evidence_review_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('network_member_identifiers','network_member_identifiers_verified_by_person_id_fkey','verified_by_person_id',' ON DELETE RESTRICT'),
    ('network_reporting_grants','network_reporting_grants_granted_by_person_id_fkey','granted_by_person_id',' ON DELETE RESTRICT'),
    ('network_reporting_memberships','network_reporting_memberships_reviewed_by_person_id_fkey','reviewed_by_person_id',' ON DELETE RESTRICT'),
    ('noncredit_completion_certificates','noncredit_completion_certificates_issued_by_person_id_fkey','issued_by_person_id',''),
    ('noncredit_completion_decisions','noncredit_completion_decisions_decided_by_person_id_fkey','decided_by_person_id',''),
    ('noncredit_completion_policies','noncredit_completion_policies_approved_by_person_id_fkey','approved_by_person_id',''),
    ('noncredit_participation_events','noncredit_participation_events_recorded_by_person_id_fkey','recorded_by_person_id',''),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_releases_published_by_person_id_fkey','published_by_person_id',' ON DELETE RESTRICT'),
    ('noncredit_training_versions','noncredit_training_versions_approved_by_person_id_fkey','approved_by_person_id',''),
    ('official_authorizations','official_authorizations_reviewed_by_person_id_fkey','reviewed_by_person_id',''),
    ('operation_publication_snapshots','operation_publication_snapshots_approved_by_person_id_fkey','approved_by_person_id',''),
    ('operator_rollout_class_links','operator_rollout_class_links_linked_by_person_id_fkey','linked_by_person_id',''),
    ('professional_capability_authorizations','professional_capability_authorizatio_approved_by_person_id_fkey','approved_by_person_id',''),
    ('professional_screening_decisions','professional_screening_decisions_decided_by_person_id_fkey','decided_by_person_id',''),
    ('professional_service_delivery_records','professional_service_delivery_record_verified_by_person_id_fkey','verified_by_person_id',''),
    ('program_applications','program_applications_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('program_publication_claims','program_publication_claims_reviewed_by_person_id_fkey','reviewed_by_person_id',''),
    ('program_readiness_policy_adoptions','program_readiness_policy_adoptions_approved_by_person_id_fkey','approved_by_person_id',''),
    ('publication_withdrawals','publication_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id',''),
    ('publisher_rollout_plans','publisher_rollout_plans_authored_by_person_id_fkey','authored_by_person_id',''),
    ('qualification_application_survey_submissions','qualification_application_survey_su_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('qualification_conditions','qualification_conditions_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_decisions','qualification_decisions_decided_by_person_id_fkey','decided_by_person_id',''),
    ('qualification_evidence_access_grants','qualification_evidence_access_grants_granted_by_person_id_fkey','granted_by_person_id',''),
    ('qualification_evidence_events','qualification_evidence_events_recorded_by_person_id_fkey','recorded_by_person_id',''),
    ('qualification_evidence_submissions','qualification_evidence_submissions_submitted_by_person_id_fkey','submitted_by_person_id',''),
    ('qualification_network_reporting_grants','qualification_network_reporting_gran_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_person_consent_withdrawals','qualification_person_consent_withdr_withdrawn_by_person_id_fkey','withdrawn_by_person_id',''),
    ('qualification_program_availability_rules','qualification_program_availability_r_reviewed_by_person_id_fkey','reviewed_by_person_id','')
) AS s(table_name,constraint_name,column_name,delete_suffix) LOOP
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
 WHERE conname=x.constraint_name AND contype='f' AND convalidated
 AND conrelid=to_regclass('education_v30.'||x.table_name)
 AND confrelid='public.people'::regclass;
 IF definition IS DISTINCT FROM ('FOREIGN KEY ('||x.column_name||') REFERENCES people(id)'||x.delete_suffix)
 THEN RAISE EXCEPTION 'Failed public Person FK: %',x.constraint_name; END IF;
 END LOOP;
 SELECT count(*) INTO left_count FROM pg_constraint WHERE contype='f'
 AND confrelid='education_v30.persons'::regclass;
 IF left_count<>149 THEN RAISE EXCEPTION 'Unexpected native FK remainder: %',left_count; END IF;
END $verify$;
COMMIT;
