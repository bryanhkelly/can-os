-- Production main only. First 30 creator/reviewer/approver actor FKs
-- migrated to the authoritative public.people, excluding learner and
-- guardian relationships, accounts, session and role grants.
-- No Person copies, new records, re-identification, or RLS changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$
DECLARE x record; before_definition text; unmatched bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' THEN RAISE EXCEPTION 'Wrong Neon database'; END IF;
 IF to_regclass('education_v30.persons') IS NULL
 OR to_regclass('public.people') IS NULL
 OR (SELECT count(*) FROM education_v30.persons)<>0
 THEN RAISE EXCEPTION 'Source Person table is not empty'; END IF;
 FOR x IN SELECT * FROM (VALUES
('application_decisions','application_decisions_decided_by_person_id_fkey','decided_by_person_id'),
('approved_supplement_assessment_sources','approved_supplement_assessment_sourc_approved_by_person_id_fkey','approved_by_person_id'),
('assessment_access_grants','assessment_access_grants_granted_by_person_id_fkey','granted_by_person_id'),
('assessment_accommodation_decisions','assessment_accommodation_decisions_approved_by_person_id_fkey','approved_by_person_id'),
('assessment_attempt_results','assessment_attempt_results_reviewed_by_person_id_fkey','reviewed_by_person_id'),
('assessment_items','assessment_items_created_by_person_id_fkey','created_by_person_id'),
('assessment_review_events','assessment_review_events_recorded_by_person_id_fkey','recorded_by_person_id'),
('assurance_case_findings','assurance_case_findings_determined_by_person_id_fkey','determined_by_person_id'),
('assurance_case_outcomes','assurance_case_outcomes_decided_by_person_id_fkey','decided_by_person_id'),
('blueprint_execution_batches','blueprint_execution_batches_executed_by_person_id_fkey','executed_by_person_id'),
('class_awards','class_awards_issued_by_person_id_fkey','issued_by_person_id'),
('class_completion_policy_versions','class_completion_policy_versions_approved_by_person_id_fkey','approved_by_person_id'),
('class_completion_policy_versions','class_completion_policy_versions_authored_by_person_id_fkey','authored_by_person_id'),
('class_enrollment_approval_requests','class_enrollment_approval_requests_reviewed_by_person_id_fkey','reviewed_by_person_id'),
('class_enrollment_invitations','class_enrollment_invitations_invited_by_person_id_fkey','invited_by_person_id'),
('class_enrollment_repeat_authorizations','class_enrollment_repeat_authorizatio_approved_by_person_id_fkey','approved_by_person_id'),
('class_enrollment_transfer_requests','class_enrollment_transfer_requests_approved_by_person_id_fkey','approved_by_person_id'),
('class_enrollment_transfer_requests','class_enrollment_transfer_requests_requested_by_person_id_fkey','requested_by_person_id'),
('class_offering_versions','class_offering_versions_created_by_person_id_fkey','created_by_person_id'),
('class_outcomes','class_outcomes_completion_decided_by_person_id_fkey','completion_decided_by_person_id'),
('class_session_agenda_revisions','class_session_agenda_revisions_created_by_person_id_fkey','created_by_person_id'),
('class_staff_assignments','class_staff_assignments_assigned_by_person_id_fkey','assigned_by_person_id'),
('class_survey_campaigns','class_survey_campaigns_linked_by_person_id_fkey','linked_by_person_id'),
('classes','classes_created_by_person_id_fkey','created_by_person_id'),
('competency_version_withdrawals','competency_version_withdrawals_withdrawn_by_person_id_fkey','withdrawn_by_person_id'),
('content_publication_manifests','content_publication_manifests_created_by_person_id_fkey','created_by_person_id'),
('content_withdrawals','content_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id'),
('control_evaluations','control_evaluations_evaluated_by_person_id_fkey','evaluated_by_person_id'),
('course_grading_policy_versions','course_grading_policy_versions_approved_by_person_id_fkey','approved_by_person_id'),
('credential_issuance_support','credential_issuance_support_authorized_by_person_id_fkey','authorized_by_person_id')
) AS expected(table_name,constraint_name,column_name) LOOP
  SELECT pg_get_constraintdef(oid) INTO before_definition
  FROM pg_constraint WHERE contype='f' AND convalidated AND NOT condeferrable
   AND conrelid=to_regclass('education_v30.'||x.table_name)
   AND confrelid='education_v30.persons'::regclass AND conname=x.constraint_name;
  IF before_definition IS DISTINCT FROM
   ('FOREIGN KEY ('||x.column_name||') REFERENCES education_v30.persons(id)')
  THEN RAISE EXCEPTION 'Unexpected FK shape: %',x.constraint_name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I row LEFT JOIN public.people person ON person.id=row.%I WHERE row.%I IS NOT NULL AND person.id IS NULL',x.table_name,x.column_name,x.column_name) INTO unmatched;
  IF unmatched<>0 THEN RAISE EXCEPTION 'Actor IDs not shared: %',x.table_name; END IF;
 END LOOP;
END $guard$;
DO $move$
DECLARE x record;
BEGIN
 FOR x IN SELECT * FROM (VALUES
('application_decisions','application_decisions_decided_by_person_id_fkey','decided_by_person_id'),
('approved_supplement_assessment_sources','approved_supplement_assessment_sourc_approved_by_person_id_fkey','approved_by_person_id'),
('assessment_access_grants','assessment_access_grants_granted_by_person_id_fkey','granted_by_person_id'),
('assessment_accommodation_decisions','assessment_accommodation_decisions_approved_by_person_id_fkey','approved_by_person_id'),
('assessment_attempt_results','assessment_attempt_results_reviewed_by_person_id_fkey','reviewed_by_person_id'),
('assessment_items','assessment_items_created_by_person_id_fkey','created_by_person_id'),
('assessment_review_events','assessment_review_events_recorded_by_person_id_fkey','recorded_by_person_id'),
('assurance_case_findings','assurance_case_findings_determined_by_person_id_fkey','determined_by_person_id'),
('assurance_case_outcomes','assurance_case_outcomes_decided_by_person_id_fkey','decided_by_person_id'),
('blueprint_execution_batches','blueprint_execution_batches_executed_by_person_id_fkey','executed_by_person_id'),
('class_awards','class_awards_issued_by_person_id_fkey','issued_by_person_id'),
('class_completion_policy_versions','class_completion_policy_versions_approved_by_person_id_fkey','approved_by_person_id'),
('class_completion_policy_versions','class_completion_policy_versions_authored_by_person_id_fkey','authored_by_person_id'),
('class_enrollment_approval_requests','class_enrollment_approval_requests_reviewed_by_person_id_fkey','reviewed_by_person_id'),
('class_enrollment_invitations','class_enrollment_invitations_invited_by_person_id_fkey','invited_by_person_id'),
('class_enrollment_repeat_authorizations','class_enrollment_repeat_authorizatio_approved_by_person_id_fkey','approved_by_person_id'),
('class_enrollment_transfer_requests','class_enrollment_transfer_requests_approved_by_person_id_fkey','approved_by_person_id'),
('class_enrollment_transfer_requests','class_enrollment_transfer_requests_requested_by_person_id_fkey','requested_by_person_id'),
('class_offering_versions','class_offering_versions_created_by_person_id_fkey','created_by_person_id'),
('class_outcomes','class_outcomes_completion_decided_by_person_id_fkey','completion_decided_by_person_id'),
('class_session_agenda_revisions','class_session_agenda_revisions_created_by_person_id_fkey','created_by_person_id'),
('class_staff_assignments','class_staff_assignments_assigned_by_person_id_fkey','assigned_by_person_id'),
('class_survey_campaigns','class_survey_campaigns_linked_by_person_id_fkey','linked_by_person_id'),
('classes','classes_created_by_person_id_fkey','created_by_person_id'),
('competency_version_withdrawals','competency_version_withdrawals_withdrawn_by_person_id_fkey','withdrawn_by_person_id'),
('content_publication_manifests','content_publication_manifests_created_by_person_id_fkey','created_by_person_id'),
('content_withdrawals','content_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id'),
('control_evaluations','control_evaluations_evaluated_by_person_id_fkey','evaluated_by_person_id'),
('course_grading_policy_versions','course_grading_policy_versions_approved_by_person_id_fkey','approved_by_person_id'),
('credential_issuance_support','credential_issuance_support_authorized_by_person_id_fkey','authorized_by_person_id')
) AS expected(table_name,constraint_name,column_name) LOOP
  EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)',x.table_name,x.constraint_name,x.constraint_name,x.column_name);
 END LOOP;
END $move$;
DO $verify$
DECLARE x record; left_count integer;
BEGIN
 FOR x IN SELECT * FROM (VALUES
('application_decisions','application_decisions_decided_by_person_id_fkey','decided_by_person_id'),
('approved_supplement_assessment_sources','approved_supplement_assessment_sourc_approved_by_person_id_fkey','approved_by_person_id'),
('assessment_access_grants','assessment_access_grants_granted_by_person_id_fkey','granted_by_person_id'),
('assessment_accommodation_decisions','assessment_accommodation_decisions_approved_by_person_id_fkey','approved_by_person_id'),
('assessment_attempt_results','assessment_attempt_results_reviewed_by_person_id_fkey','reviewed_by_person_id'),
('assessment_items','assessment_items_created_by_person_id_fkey','created_by_person_id'),
('assessment_review_events','assessment_review_events_recorded_by_person_id_fkey','recorded_by_person_id'),
('assurance_case_findings','assurance_case_findings_determined_by_person_id_fkey','determined_by_person_id'),
('assurance_case_outcomes','assurance_case_outcomes_decided_by_person_id_fkey','decided_by_person_id'),
('blueprint_execution_batches','blueprint_execution_batches_executed_by_person_id_fkey','executed_by_person_id'),
('class_awards','class_awards_issued_by_person_id_fkey','issued_by_person_id'),
('class_completion_policy_versions','class_completion_policy_versions_approved_by_person_id_fkey','approved_by_person_id'),
('class_completion_policy_versions','class_completion_policy_versions_authored_by_person_id_fkey','authored_by_person_id'),
('class_enrollment_approval_requests','class_enrollment_approval_requests_reviewed_by_person_id_fkey','reviewed_by_person_id'),
('class_enrollment_invitations','class_enrollment_invitations_invited_by_person_id_fkey','invited_by_person_id'),
('class_enrollment_repeat_authorizations','class_enrollment_repeat_authorizatio_approved_by_person_id_fkey','approved_by_person_id'),
('class_enrollment_transfer_requests','class_enrollment_transfer_requests_approved_by_person_id_fkey','approved_by_person_id'),
('class_enrollment_transfer_requests','class_enrollment_transfer_requests_requested_by_person_id_fkey','requested_by_person_id'),
('class_offering_versions','class_offering_versions_created_by_person_id_fkey','created_by_person_id'),
('class_outcomes','class_outcomes_completion_decided_by_person_id_fkey','completion_decided_by_person_id'),
('class_session_agenda_revisions','class_session_agenda_revisions_created_by_person_id_fkey','created_by_person_id'),
('class_staff_assignments','class_staff_assignments_assigned_by_person_id_fkey','assigned_by_person_id'),
('class_survey_campaigns','class_survey_campaigns_linked_by_person_id_fkey','linked_by_person_id'),
('classes','classes_created_by_person_id_fkey','created_by_person_id'),
('competency_version_withdrawals','competency_version_withdrawals_withdrawn_by_person_id_fkey','withdrawn_by_person_id'),
('content_publication_manifests','content_publication_manifests_created_by_person_id_fkey','created_by_person_id'),
('content_withdrawals','content_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id'),
('control_evaluations','control_evaluations_evaluated_by_person_id_fkey','evaluated_by_person_id'),
('course_grading_policy_versions','course_grading_policy_versions_approved_by_person_id_fkey','approved_by_person_id'),
('credential_issuance_support','credential_issuance_support_authorized_by_person_id_fkey','authorized_by_person_id')
) AS expected(table_name,constraint_name,column_name) LOOP
  IF NOT EXISTS(
   SELECT 1 FROM pg_constraint WHERE contype='f' AND convalidated
    AND conrelid=to_regclass('education_v30.'||x.table_name)
    AND confrelid='public.people'::regclass AND conname=x.constraint_name
    AND pg_get_constraintdef(oid)=('FOREIGN KEY ('||x.column_name||') REFERENCES people(id)')
  ) THEN RAISE EXCEPTION 'Person rebind not valid: %',x.constraint_name; END IF;
 END LOOP;
 SELECT count(*) INTO left_count FROM pg_constraint
 WHERE contype='f' AND confrelid='education_v30.persons'::regclass;
 IF left_count<>209 THEN RAISE EXCEPTION 'Remaining Person FK count is %',left_count; END IF;
END $verify$;
COMMIT;
