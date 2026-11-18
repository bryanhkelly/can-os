-- CAN OS Neon main only: second batch of 30 author/reviewer actor
-- attribution FKs, without touching learner identity, guardian authority,
-- access account, session or restricted Person evidence records.
-- Exact existing public Person IDs, preserved constraints and no new bridge.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$
DECLARE e record; definition text; unmapped bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' THEN RAISE EXCEPTION 'Refusing non-main database'; END IF;
 IF to_regclass('education_v30.persons') IS NULL
 OR (SELECT count(*) FROM education_v30.persons)<>0
 OR to_regclass('public.people') IS NULL
 THEN RAISE EXCEPTION 'Canonical Person graph has unexpected data'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE contype='f'
 AND confrelid='education_v30.persons'::regclass)<>209
 THEN RAISE EXCEPTION 'Prior Person FK migration is not complete'; END IF;
 FOR e IN SELECT * FROM (VALUES
    ('deployment_offering_adoptions','deployment_offering_adoptions_approved_by_person_id_fkey','approved_by_person_id'),
    ('deployment_readiness_reviews','deployment_readiness_reviews_evaluated_by_person_id_fkey','evaluated_by_person_id'),
    ('equipment_assignments','equipment_assignments_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('evaluation_bases','evaluation_bases_recorded_by_person_id_fkey','recorded_by_person_id'),
    ('evidence_document_versions','evidence_document_versions_verified_by_person_id_fkey','verified_by_person_id'),
    ('feedback_items','feedback_items_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('foundation_program_adoptions','foundation_program_adoptions_approved_by_person_id_fkey','approved_by_person_id'),
    ('foundation_withdrawals','foundation_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('funding_allocation_attributions','funding_allocation_attributions_verified_by_person_id_fkey','verified_by_person_id'),
    ('funding_award_budget_versions','funding_award_budget_versions_approved_by_person_id_fkey','approved_by_person_id'),
    ('funding_eligibility_evaluations','funding_eligibility_evaluations_evaluated_by_person_id_fkey','evaluated_by_person_id'),
    ('governance_policy_adoptions','governance_policy_adoptions_decided_by_person_id_fkey','decided_by_person_id'),
    ('initiative_impact_snapshots','initiative_impact_snapshots_approved_by_person_id_fkey','approved_by_person_id'),
    ('initiative_impact_snapshots','initiative_impact_snapshots_generated_by_person_id_fkey','generated_by_person_id'),
    ('instructional_track_policy_versions','instructional_track_policy_versions_created_by_person_id_fkey','created_by_person_id'),
    ('instructional_track_policy_versions','instructional_track_policy_versions_published_by_person_id_fkey','published_by_person_id'),
    ('instructional_track_policy_withdrawals','instructional_track_policy_withdra_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('instructional_track_versions','instructional_track_versions_created_by_person_id_fkey','created_by_person_id'),
    ('instructional_track_versions','instructional_track_versions_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('instructor_supplement_withdrawals','instructor_supplement_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('learner_achievement_decisions','learner_achievement_decisions_decided_by_person_id_fkey','decided_by_person_id'),
    ('learner_competency_determinations','learner_competency_determinations_determined_by_person_id_fkey','determined_by_person_id'),
    ('learner_foundation_assignments','learner_foundation_assignments_assigned_by_person_id_fkey','assigned_by_person_id'),
    ('learning_award_definition_versions','learning_award_definition_versions_approved_by_person_id_fkey','approved_by_person_id'),
    ('learning_award_definition_versions','learning_award_definition_versions_created_by_person_id_fkey','created_by_person_id'),
    ('learning_award_issuance_events','learning_award_issuance_events_decided_by_person_id_fkey','decided_by_person_id'),
    ('learning_award_issuances','learning_award_issuances_issued_by_person_id_fkey','issued_by_person_id'),
    ('learning_completion_evidence_bindings','learning_completion_evidence_bindin_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('learning_completion_evidence_bindings','learning_completion_evidence_binding_approved_by_person_id_fkey','approved_by_person_id'),
    ('learning_completion_evidence_review_requests','learning_completion_evidence_review__reviewed_by_person_id_fkey','reviewed_by_person_id')
) AS entries(table_name,constraint_name,column_name) LOOP
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
  WHERE contype='f' AND convalidated AND NOT condeferrable
  AND conrelid=to_regclass('education_v30.'||e.table_name)
  AND confrelid='education_v30.persons'::regclass
  AND conname=e.constraint_name;
  IF definition IS DISTINCT FROM
   ('FOREIGN KEY ('||e.column_name||') REFERENCES education_v30.persons(id)')
  THEN RAISE EXCEPTION 'Unexpected FK: %',e.constraint_name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I r LEFT JOIN public.people p ON p.id=r.%I WHERE r.%I IS NOT NULL AND p.id IS NULL',e.table_name,e.column_name,e.column_name) INTO unmapped;
  IF unmapped<>0 THEN RAISE EXCEPTION 'Unmapped actor Person: %',e.table_name; END IF;
 END LOOP;
END $guard$;
DO $rebind$
DECLARE e record;
BEGIN
 FOR e IN SELECT * FROM (VALUES
    ('deployment_offering_adoptions','deployment_offering_adoptions_approved_by_person_id_fkey','approved_by_person_id'),
    ('deployment_readiness_reviews','deployment_readiness_reviews_evaluated_by_person_id_fkey','evaluated_by_person_id'),
    ('equipment_assignments','equipment_assignments_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('evaluation_bases','evaluation_bases_recorded_by_person_id_fkey','recorded_by_person_id'),
    ('evidence_document_versions','evidence_document_versions_verified_by_person_id_fkey','verified_by_person_id'),
    ('feedback_items','feedback_items_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('foundation_program_adoptions','foundation_program_adoptions_approved_by_person_id_fkey','approved_by_person_id'),
    ('foundation_withdrawals','foundation_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('funding_allocation_attributions','funding_allocation_attributions_verified_by_person_id_fkey','verified_by_person_id'),
    ('funding_award_budget_versions','funding_award_budget_versions_approved_by_person_id_fkey','approved_by_person_id'),
    ('funding_eligibility_evaluations','funding_eligibility_evaluations_evaluated_by_person_id_fkey','evaluated_by_person_id'),
    ('governance_policy_adoptions','governance_policy_adoptions_decided_by_person_id_fkey','decided_by_person_id'),
    ('initiative_impact_snapshots','initiative_impact_snapshots_approved_by_person_id_fkey','approved_by_person_id'),
    ('initiative_impact_snapshots','initiative_impact_snapshots_generated_by_person_id_fkey','generated_by_person_id'),
    ('instructional_track_policy_versions','instructional_track_policy_versions_created_by_person_id_fkey','created_by_person_id'),
    ('instructional_track_policy_versions','instructional_track_policy_versions_published_by_person_id_fkey','published_by_person_id'),
    ('instructional_track_policy_withdrawals','instructional_track_policy_withdra_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('instructional_track_versions','instructional_track_versions_created_by_person_id_fkey','created_by_person_id'),
    ('instructional_track_versions','instructional_track_versions_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('instructor_supplement_withdrawals','instructor_supplement_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('learner_achievement_decisions','learner_achievement_decisions_decided_by_person_id_fkey','decided_by_person_id'),
    ('learner_competency_determinations','learner_competency_determinations_determined_by_person_id_fkey','determined_by_person_id'),
    ('learner_foundation_assignments','learner_foundation_assignments_assigned_by_person_id_fkey','assigned_by_person_id'),
    ('learning_award_definition_versions','learning_award_definition_versions_approved_by_person_id_fkey','approved_by_person_id'),
    ('learning_award_definition_versions','learning_award_definition_versions_created_by_person_id_fkey','created_by_person_id'),
    ('learning_award_issuance_events','learning_award_issuance_events_decided_by_person_id_fkey','decided_by_person_id'),
    ('learning_award_issuances','learning_award_issuances_issued_by_person_id_fkey','issued_by_person_id'),
    ('learning_completion_evidence_bindings','learning_completion_evidence_bindin_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('learning_completion_evidence_bindings','learning_completion_evidence_binding_approved_by_person_id_fkey','approved_by_person_id'),
    ('learning_completion_evidence_review_requests','learning_completion_evidence_review__reviewed_by_person_id_fkey','reviewed_by_person_id')
) AS entries(table_name,constraint_name,column_name) LOOP
  EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)',e.table_name,e.constraint_name,e.constraint_name,e.column_name);
 END LOOP;
END $rebind$;
DO $verify$
DECLARE e record; remaining integer;
BEGIN
 FOR e IN SELECT * FROM (VALUES
    ('deployment_offering_adoptions','deployment_offering_adoptions_approved_by_person_id_fkey','approved_by_person_id'),
    ('deployment_readiness_reviews','deployment_readiness_reviews_evaluated_by_person_id_fkey','evaluated_by_person_id'),
    ('equipment_assignments','equipment_assignments_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('evaluation_bases','evaluation_bases_recorded_by_person_id_fkey','recorded_by_person_id'),
    ('evidence_document_versions','evidence_document_versions_verified_by_person_id_fkey','verified_by_person_id'),
    ('feedback_items','feedback_items_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('foundation_program_adoptions','foundation_program_adoptions_approved_by_person_id_fkey','approved_by_person_id'),
    ('foundation_withdrawals','foundation_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('funding_allocation_attributions','funding_allocation_attributions_verified_by_person_id_fkey','verified_by_person_id'),
    ('funding_award_budget_versions','funding_award_budget_versions_approved_by_person_id_fkey','approved_by_person_id'),
    ('funding_eligibility_evaluations','funding_eligibility_evaluations_evaluated_by_person_id_fkey','evaluated_by_person_id'),
    ('governance_policy_adoptions','governance_policy_adoptions_decided_by_person_id_fkey','decided_by_person_id'),
    ('initiative_impact_snapshots','initiative_impact_snapshots_approved_by_person_id_fkey','approved_by_person_id'),
    ('initiative_impact_snapshots','initiative_impact_snapshots_generated_by_person_id_fkey','generated_by_person_id'),
    ('instructional_track_policy_versions','instructional_track_policy_versions_created_by_person_id_fkey','created_by_person_id'),
    ('instructional_track_policy_versions','instructional_track_policy_versions_published_by_person_id_fkey','published_by_person_id'),
    ('instructional_track_policy_withdrawals','instructional_track_policy_withdra_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('instructional_track_versions','instructional_track_versions_created_by_person_id_fkey','created_by_person_id'),
    ('instructional_track_versions','instructional_track_versions_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('instructor_supplement_withdrawals','instructor_supplement_withdrawals_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('learner_achievement_decisions','learner_achievement_decisions_decided_by_person_id_fkey','decided_by_person_id'),
    ('learner_competency_determinations','learner_competency_determinations_determined_by_person_id_fkey','determined_by_person_id'),
    ('learner_foundation_assignments','learner_foundation_assignments_assigned_by_person_id_fkey','assigned_by_person_id'),
    ('learning_award_definition_versions','learning_award_definition_versions_approved_by_person_id_fkey','approved_by_person_id'),
    ('learning_award_definition_versions','learning_award_definition_versions_created_by_person_id_fkey','created_by_person_id'),
    ('learning_award_issuance_events','learning_award_issuance_events_decided_by_person_id_fkey','decided_by_person_id'),
    ('learning_award_issuances','learning_award_issuances_issued_by_person_id_fkey','issued_by_person_id'),
    ('learning_completion_evidence_bindings','learning_completion_evidence_bindin_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('learning_completion_evidence_bindings','learning_completion_evidence_binding_approved_by_person_id_fkey','approved_by_person_id'),
    ('learning_completion_evidence_review_requests','learning_completion_evidence_review__reviewed_by_person_id_fkey','reviewed_by_person_id')
) AS entries(table_name,constraint_name,column_name) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint
    WHERE contype='f' AND convalidated
    AND conrelid=to_regclass('education_v30.'||e.table_name)
    AND confrelid='public.people'::regclass AND conname=e.constraint_name)
  THEN RAISE EXCEPTION 'Missing migrated actor FK: %',e.constraint_name; END IF;
 END LOOP;
 SELECT count(*) INTO remaining FROM pg_constraint
 WHERE contype='f' AND confrelid='education_v30.persons'::regclass;
 IF remaining<>179 THEN RAISE EXCEPTION 'Unreviewed Person graph change: %',remaining; END IF;
END $verify$;
COMMIT;
