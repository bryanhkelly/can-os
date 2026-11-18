-- CAN OS Neon main: converge 67 remaining author, verifier,
-- facilitator, auditor and reviewer person references onto public.people.
-- Enforces the same *existing* Person UUID and ON DELETE behavior.
-- Learner, guardian, enrollment-participant, account and session
-- identity relationships are intentionally excluded pending runtime cutover.
-- Source Person table is empty. Existing child table RLS is untouched.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $guard$
DECLARE x record; definition text; unmatched bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' THEN RAISE EXCEPTION 'Not Neon main'; END IF;
 IF to_regclass('education_v30.persons') IS NULL
 OR to_regclass('public.people') IS NULL
 OR (SELECT count(*) FROM education_v30.persons)<>0
 THEN RAISE EXCEPTION 'Native Person table unexpected'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE contype='f'
 AND confrelid='education_v30.persons'::regclass)<>130
 THEN RAISE EXCEPTION 'Unreviewed Person FK graph'; END IF;
 FOR x IN SELECT * FROM (VALUES
    ('education_v30','academic_credit_awards','academic_credit_awards_awarded_by_person_id_fkey','awarded_by_person_id',''),
    ('education_v30','academic_framework_review_decisions','academic_framework_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','applicant_offer_responses','applicant_offer_responses_responded_by_person_id_fkey','responded_by_person_id',''),
    ('education_v30','assessment_form_review_decisions','assessment_form_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','assessment_item_review_decisions','assessment_item_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','assessment_item_scoring_decisions','assessment_item_scoring_decisions_grader_person_id_fkey','grader_person_id',''),
    ('education_v30','assessment_scoring_assignments','assessment_scoring_assignments_grader_person_id_fkey','grader_person_id',''),
    ('education_v30','assessment_version_review_decisions','assessment_version_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','assurance_case_events','assurance_case_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','audit_events','audit_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','blueprint_component_approval_decisions','blueprint_component_approval_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','class_sessions','class_sessions_facilitator_person_id_fkey','facilitator_person_id',''),
    ('education_v30','configuration_reviews','configuration_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','content_manifest_review_decisions','content_manifest_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','course_curriculum_alignments','course_curriculum_alignments_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','domain_events','domain_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','equipment_custody_events','equipment_custody_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','facilitated_classroom_plans','facilitated_classroom_plans_facilitator_person_id_fkey','facilitator_person_id',''),
    ('education_v30','facilitated_learning_playback','facilitated_playback_facilitator_fk','facilitator_person_id',''),
    ('education_v30','facilitated_learning_sessions','facilitated_rooms_facilitator_fk','facilitator_person_id',''),
    ('education_v30','facilitated_room_assisted_activity_evidence','facilitated_room_assisted_activity_e_facilitator_person_id_fkey','facilitator_person_id',''),
    ('education_v30','foundation_instructional_releases','foundation_instructional_releases_presenter_person_id_fkey','presenter_person_id',''),
    ('education_v30','foundation_release_review_decisions','foundation_release_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','foundation_resource_bindings','foundation_resource_bindings_presenter_person_id_fkey','presenter_person_id',''),
    ('education_v30','funding_cost_classifications','funding_cost_classifications_classified_by_person_id_fkey','classified_by_person_id',''),
    ('education_v30','governance_policy_versions','governance_policy_versions_author_person_id_fkey','author_person_id',''),
    ('education_v30','grading_assignments','grading_assignments_grader_person_id_fkey','grader_person_id',''),
    ('education_v30','graduation_decisions','graduation_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','improvement_verifications','improvement_verifications_verifier_person_id_fkey','verifier_person_id',''),
    ('education_v30','instructional_track_command_receipts','instructional_track_command_receipts_actor_person_id_fkey','actor_person_id',' ON DELETE RESTRICT'),
    ('education_v30','instructional_track_reviews','instructional_track_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','instructional_tracks','instructional_tracks_presenter_person_id_fkey','presenter_person_id',''),
    ('education_v30','instructor_supplement_reviews','instructor_supplement_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','instructor_supplements','instructor_supplements_author_person_id_fkey','author_person_id',''),
    ('education_v30','learner_competency_evidence','learner_competency_evidence_validated_by_person_id_fkey','validated_by_person_id',''),
    ('education_v30','learner_data_disclosures','learner_data_disclosures_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','learner_track_selections','learner_track_selections_selected_by_person_id_fkey','selected_by_person_id',''),
    ('education_v30','noncredit_released_seats','noncredit_released_seats_released_by_person_id_fkey','released_by_person_id',''),
    ('education_v30','noncredit_training_versions','noncredit_training_versions_author_person_id_fkey','author_person_id',''),
    ('education_v30','official_assessment_result_adoptions','official_assessment_result_adoptions_adopted_by_person_id_fkey','adopted_by_person_id',''),
    ('education_v30','official_authorization_events','official_authorization_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','official_course_grades','official_course_grades_finalized_by_person_id_fkey','finalized_by_person_id',''),
    ('education_v30','operational_authorization_decisions','operational_authorization_decisions_authorizing_person_id_fkey','authorizing_person_id',''),
    ('education_v30','operator_rollout_applications','operator_rollout_applications_prepared_by_person_id_fkey','prepared_by_person_id',''),
    ('education_v30','operator_rollout_decisions','operator_rollout_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','production_review_decisions','production_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','published_asset_reviews','published_asset_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','publisher_rollout_decisions','publisher_rollout_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_definition_versions','qualification_definition_versions_author_person_id_fkey','author_person_id',''),
    ('education_v30','qualification_evidence_review_decisions','qualification_evidence_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_operational_gates','qualification_operational_gates_adopted_by_person_id_fkey','adopted_by_person_id',''),
    ('education_v30','qualification_program_fit_reviewer_authorizations','qualification_program_fit_reviewer_auth_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_program_fit_reviewer_revocations','qualification_program_fit_reviewer_re_revoked_by_person_id_fkey','revoked_by_person_id',''),
    ('education_v30','qualification_reviewer_authorizations','qualification_reviewer_authorizations_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_template_reviews','qualification_template_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','quality_reassessments','quality_reassessments_reassessed_by_person_id_fkey','reassessed_by_person_id',''),
    ('education_v30','site_space_capability_assertions','site_space_capability_assertions_claimed_by_person_id_fkey','claimed_by_person_id',''),
    ('education_v30','site_space_capability_verifications','site_space_capability_verifications_verifier_person_id_fkey','verifier_person_id',''),
    ('education_v30','survey_version_reviews','survey_version_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','survey_versions','survey_versions_author_person_id_fkey','author_person_id',''),
    ('public','assurance_case_escalations','assurance_case_escalations_escalated_by_person_id_fkey','escalated_by_person_id',''),
    ('public','evaluation_basis_invalidations','evaluation_basis_invalidations_detected_by_person_id_fkey','detected_by_person_id',''),
    ('public','feedback_followups','feedback_followups_initiated_by_person_id_fkey','initiated_by_person_id',''),
    ('public','founding_development_milestones','founding_development_milestones_accepted_by_person_id_fkey','accepted_by_person_id',''),
    ('public','prospect_learner_conversions','prospect_learner_conversions_converted_by_person_id_fkey','converted_by_person_id',''),
    ('public','quality_evaluations','quality_evaluations_reviewer_person_id_fkey','reviewer_person_id',''),
    ('public','technology_readiness_evaluations','technology_readiness_evaluations_evaluator_person_id_fkey','evaluator_person_id','')
) AS refs(source_schema,source_table,constraint_name,source_column,delete_clause) LOOP
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
  WHERE contype='f' AND convalidated AND NOT condeferrable
  AND conrelid=to_regclass(x.source_schema||'.'||x.source_table)
  AND confrelid='education_v30.persons'::regclass AND conname=x.constraint_name;
  IF definition IS DISTINCT FROM
   ('FOREIGN KEY ('||x.source_column||') REFERENCES education_v30.persons(id)'||x.delete_clause)
  THEN RAISE EXCEPTION 'Changed Person foreign key: %',x.constraint_name; END IF;
  EXECUTE format('SELECT count(*) FROM %I.%I ch LEFT JOIN public.people person ON person.id=ch.%I WHERE ch.%I IS NOT NULL AND person.id IS NULL',
   x.source_schema,x.source_table,x.source_column,x.source_column) INTO unmatched;
  IF unmatched<>0 THEN RAISE EXCEPTION 'Unmatched actor Person in %.%',x.source_schema,x.source_table; END IF;
 END LOOP;
END $guard$;
DO $migrate$
DECLARE x record;
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('education_v30','academic_credit_awards','academic_credit_awards_awarded_by_person_id_fkey','awarded_by_person_id',''),
    ('education_v30','academic_framework_review_decisions','academic_framework_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','applicant_offer_responses','applicant_offer_responses_responded_by_person_id_fkey','responded_by_person_id',''),
    ('education_v30','assessment_form_review_decisions','assessment_form_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','assessment_item_review_decisions','assessment_item_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','assessment_item_scoring_decisions','assessment_item_scoring_decisions_grader_person_id_fkey','grader_person_id',''),
    ('education_v30','assessment_scoring_assignments','assessment_scoring_assignments_grader_person_id_fkey','grader_person_id',''),
    ('education_v30','assessment_version_review_decisions','assessment_version_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','assurance_case_events','assurance_case_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','audit_events','audit_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','blueprint_component_approval_decisions','blueprint_component_approval_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','class_sessions','class_sessions_facilitator_person_id_fkey','facilitator_person_id',''),
    ('education_v30','configuration_reviews','configuration_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','content_manifest_review_decisions','content_manifest_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','course_curriculum_alignments','course_curriculum_alignments_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','domain_events','domain_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','equipment_custody_events','equipment_custody_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','facilitated_classroom_plans','facilitated_classroom_plans_facilitator_person_id_fkey','facilitator_person_id',''),
    ('education_v30','facilitated_learning_playback','facilitated_playback_facilitator_fk','facilitator_person_id',''),
    ('education_v30','facilitated_learning_sessions','facilitated_rooms_facilitator_fk','facilitator_person_id',''),
    ('education_v30','facilitated_room_assisted_activity_evidence','facilitated_room_assisted_activity_e_facilitator_person_id_fkey','facilitator_person_id',''),
    ('education_v30','foundation_instructional_releases','foundation_instructional_releases_presenter_person_id_fkey','presenter_person_id',''),
    ('education_v30','foundation_release_review_decisions','foundation_release_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','foundation_resource_bindings','foundation_resource_bindings_presenter_person_id_fkey','presenter_person_id',''),
    ('education_v30','funding_cost_classifications','funding_cost_classifications_classified_by_person_id_fkey','classified_by_person_id',''),
    ('education_v30','governance_policy_versions','governance_policy_versions_author_person_id_fkey','author_person_id',''),
    ('education_v30','grading_assignments','grading_assignments_grader_person_id_fkey','grader_person_id',''),
    ('education_v30','graduation_decisions','graduation_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','improvement_verifications','improvement_verifications_verifier_person_id_fkey','verifier_person_id',''),
    ('education_v30','instructional_track_command_receipts','instructional_track_command_receipts_actor_person_id_fkey','actor_person_id',' ON DELETE RESTRICT'),
    ('education_v30','instructional_track_reviews','instructional_track_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','instructional_tracks','instructional_tracks_presenter_person_id_fkey','presenter_person_id',''),
    ('education_v30','instructor_supplement_reviews','instructor_supplement_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','instructor_supplements','instructor_supplements_author_person_id_fkey','author_person_id',''),
    ('education_v30','learner_competency_evidence','learner_competency_evidence_validated_by_person_id_fkey','validated_by_person_id',''),
    ('education_v30','learner_data_disclosures','learner_data_disclosures_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','learner_track_selections','learner_track_selections_selected_by_person_id_fkey','selected_by_person_id',''),
    ('education_v30','noncredit_released_seats','noncredit_released_seats_released_by_person_id_fkey','released_by_person_id',''),
    ('education_v30','noncredit_training_versions','noncredit_training_versions_author_person_id_fkey','author_person_id',''),
    ('education_v30','official_assessment_result_adoptions','official_assessment_result_adoptions_adopted_by_person_id_fkey','adopted_by_person_id',''),
    ('education_v30','official_authorization_events','official_authorization_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','official_course_grades','official_course_grades_finalized_by_person_id_fkey','finalized_by_person_id',''),
    ('education_v30','operational_authorization_decisions','operational_authorization_decisions_authorizing_person_id_fkey','authorizing_person_id',''),
    ('education_v30','operator_rollout_applications','operator_rollout_applications_prepared_by_person_id_fkey','prepared_by_person_id',''),
    ('education_v30','operator_rollout_decisions','operator_rollout_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','production_review_decisions','production_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','published_asset_reviews','published_asset_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','publisher_rollout_decisions','publisher_rollout_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_definition_versions','qualification_definition_versions_author_person_id_fkey','author_person_id',''),
    ('education_v30','qualification_evidence_review_decisions','qualification_evidence_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_operational_gates','qualification_operational_gates_adopted_by_person_id_fkey','adopted_by_person_id',''),
    ('education_v30','qualification_program_fit_reviewer_authorizations','qualification_program_fit_reviewer_auth_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_program_fit_reviewer_revocations','qualification_program_fit_reviewer_re_revoked_by_person_id_fkey','revoked_by_person_id',''),
    ('education_v30','qualification_reviewer_authorizations','qualification_reviewer_authorizations_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_template_reviews','qualification_template_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','quality_reassessments','quality_reassessments_reassessed_by_person_id_fkey','reassessed_by_person_id',''),
    ('education_v30','site_space_capability_assertions','site_space_capability_assertions_claimed_by_person_id_fkey','claimed_by_person_id',''),
    ('education_v30','site_space_capability_verifications','site_space_capability_verifications_verifier_person_id_fkey','verifier_person_id',''),
    ('education_v30','survey_version_reviews','survey_version_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','survey_versions','survey_versions_author_person_id_fkey','author_person_id',''),
    ('public','assurance_case_escalations','assurance_case_escalations_escalated_by_person_id_fkey','escalated_by_person_id',''),
    ('public','evaluation_basis_invalidations','evaluation_basis_invalidations_detected_by_person_id_fkey','detected_by_person_id',''),
    ('public','feedback_followups','feedback_followups_initiated_by_person_id_fkey','initiated_by_person_id',''),
    ('public','founding_development_milestones','founding_development_milestones_accepted_by_person_id_fkey','accepted_by_person_id',''),
    ('public','prospect_learner_conversions','prospect_learner_conversions_converted_by_person_id_fkey','converted_by_person_id',''),
    ('public','quality_evaluations','quality_evaluations_reviewer_person_id_fkey','reviewer_person_id',''),
    ('public','technology_readiness_evaluations','technology_readiness_evaluations_evaluator_person_id_fkey','evaluator_person_id','')
) AS refs(source_schema,source_table,constraint_name,source_column,delete_clause) LOOP
  EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)%s',
   x.source_schema,x.source_table,x.constraint_name,x.constraint_name,x.source_column,x.delete_clause);
 END LOOP;
END $migrate$;
DO $verify$
DECLARE x record; definition text;
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('education_v30','academic_credit_awards','academic_credit_awards_awarded_by_person_id_fkey','awarded_by_person_id',''),
    ('education_v30','academic_framework_review_decisions','academic_framework_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','applicant_offer_responses','applicant_offer_responses_responded_by_person_id_fkey','responded_by_person_id',''),
    ('education_v30','assessment_form_review_decisions','assessment_form_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','assessment_item_review_decisions','assessment_item_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','assessment_item_scoring_decisions','assessment_item_scoring_decisions_grader_person_id_fkey','grader_person_id',''),
    ('education_v30','assessment_scoring_assignments','assessment_scoring_assignments_grader_person_id_fkey','grader_person_id',''),
    ('education_v30','assessment_version_review_decisions','assessment_version_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','assurance_case_events','assurance_case_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','audit_events','audit_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','blueprint_component_approval_decisions','blueprint_component_approval_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','class_sessions','class_sessions_facilitator_person_id_fkey','facilitator_person_id',''),
    ('education_v30','configuration_reviews','configuration_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','content_manifest_review_decisions','content_manifest_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','course_curriculum_alignments','course_curriculum_alignments_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','domain_events','domain_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','equipment_custody_events','equipment_custody_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','facilitated_classroom_plans','facilitated_classroom_plans_facilitator_person_id_fkey','facilitator_person_id',''),
    ('education_v30','facilitated_learning_playback','facilitated_playback_facilitator_fk','facilitator_person_id',''),
    ('education_v30','facilitated_learning_sessions','facilitated_rooms_facilitator_fk','facilitator_person_id',''),
    ('education_v30','facilitated_room_assisted_activity_evidence','facilitated_room_assisted_activity_e_facilitator_person_id_fkey','facilitator_person_id',''),
    ('education_v30','foundation_instructional_releases','foundation_instructional_releases_presenter_person_id_fkey','presenter_person_id',''),
    ('education_v30','foundation_release_review_decisions','foundation_release_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','foundation_resource_bindings','foundation_resource_bindings_presenter_person_id_fkey','presenter_person_id',''),
    ('education_v30','funding_cost_classifications','funding_cost_classifications_classified_by_person_id_fkey','classified_by_person_id',''),
    ('education_v30','governance_policy_versions','governance_policy_versions_author_person_id_fkey','author_person_id',''),
    ('education_v30','grading_assignments','grading_assignments_grader_person_id_fkey','grader_person_id',''),
    ('education_v30','graduation_decisions','graduation_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','improvement_verifications','improvement_verifications_verifier_person_id_fkey','verifier_person_id',''),
    ('education_v30','instructional_track_command_receipts','instructional_track_command_receipts_actor_person_id_fkey','actor_person_id',' ON DELETE RESTRICT'),
    ('education_v30','instructional_track_reviews','instructional_track_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','instructional_tracks','instructional_tracks_presenter_person_id_fkey','presenter_person_id',''),
    ('education_v30','instructor_supplement_reviews','instructor_supplement_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','instructor_supplements','instructor_supplements_author_person_id_fkey','author_person_id',''),
    ('education_v30','learner_competency_evidence','learner_competency_evidence_validated_by_person_id_fkey','validated_by_person_id',''),
    ('education_v30','learner_data_disclosures','learner_data_disclosures_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','learner_track_selections','learner_track_selections_selected_by_person_id_fkey','selected_by_person_id',''),
    ('education_v30','noncredit_released_seats','noncredit_released_seats_released_by_person_id_fkey','released_by_person_id',''),
    ('education_v30','noncredit_training_versions','noncredit_training_versions_author_person_id_fkey','author_person_id',''),
    ('education_v30','official_assessment_result_adoptions','official_assessment_result_adoptions_adopted_by_person_id_fkey','adopted_by_person_id',''),
    ('education_v30','official_authorization_events','official_authorization_events_actor_person_id_fkey','actor_person_id',''),
    ('education_v30','official_course_grades','official_course_grades_finalized_by_person_id_fkey','finalized_by_person_id',''),
    ('education_v30','operational_authorization_decisions','operational_authorization_decisions_authorizing_person_id_fkey','authorizing_person_id',''),
    ('education_v30','operator_rollout_applications','operator_rollout_applications_prepared_by_person_id_fkey','prepared_by_person_id',''),
    ('education_v30','operator_rollout_decisions','operator_rollout_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','production_review_decisions','production_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','published_asset_reviews','published_asset_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','publisher_rollout_decisions','publisher_rollout_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_definition_versions','qualification_definition_versions_author_person_id_fkey','author_person_id',''),
    ('education_v30','qualification_evidence_review_decisions','qualification_evidence_review_decisions_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_operational_gates','qualification_operational_gates_adopted_by_person_id_fkey','adopted_by_person_id',''),
    ('education_v30','qualification_program_fit_reviewer_authorizations','qualification_program_fit_reviewer_auth_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_program_fit_reviewer_revocations','qualification_program_fit_reviewer_re_revoked_by_person_id_fkey','revoked_by_person_id',''),
    ('education_v30','qualification_reviewer_authorizations','qualification_reviewer_authorizations_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','qualification_template_reviews','qualification_template_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','quality_reassessments','quality_reassessments_reassessed_by_person_id_fkey','reassessed_by_person_id',''),
    ('education_v30','site_space_capability_assertions','site_space_capability_assertions_claimed_by_person_id_fkey','claimed_by_person_id',''),
    ('education_v30','site_space_capability_verifications','site_space_capability_verifications_verifier_person_id_fkey','verifier_person_id',''),
    ('education_v30','survey_version_reviews','survey_version_reviews_reviewer_person_id_fkey','reviewer_person_id',''),
    ('education_v30','survey_versions','survey_versions_author_person_id_fkey','author_person_id',''),
    ('public','assurance_case_escalations','assurance_case_escalations_escalated_by_person_id_fkey','escalated_by_person_id',''),
    ('public','evaluation_basis_invalidations','evaluation_basis_invalidations_detected_by_person_id_fkey','detected_by_person_id',''),
    ('public','feedback_followups','feedback_followups_initiated_by_person_id_fkey','initiated_by_person_id',''),
    ('public','founding_development_milestones','founding_development_milestones_accepted_by_person_id_fkey','accepted_by_person_id',''),
    ('public','prospect_learner_conversions','prospect_learner_conversions_converted_by_person_id_fkey','converted_by_person_id',''),
    ('public','quality_evaluations','quality_evaluations_reviewer_person_id_fkey','reviewer_person_id',''),
    ('public','technology_readiness_evaluations','technology_readiness_evaluations_evaluator_person_id_fkey','evaluator_person_id','')
) AS refs(source_schema,source_table,constraint_name,source_column,delete_clause) LOOP
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE contype='f'
    AND convalidated AND conrelid=to_regclass(x.source_schema||'.'||x.source_table)
    AND confrelid='public.people'::regclass AND conname=x.constraint_name;
  IF definition IS DISTINCT FROM
    ('FOREIGN KEY ('||x.source_column||') REFERENCES people(id)'||x.delete_clause)
  THEN RAISE EXCEPTION 'Failed to rebind actor FK: %',x.constraint_name; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_constraint
   WHERE contype='f' AND confrelid='education_v30.persons'::regclass)<>63
 THEN RAISE EXCEPTION 'Remaining native Person graph changed'; END IF;
END $verify$;
COMMIT;
