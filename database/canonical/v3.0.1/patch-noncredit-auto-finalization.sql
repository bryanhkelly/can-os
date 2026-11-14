-- Controlled canonical v3.0.1 extension for objective, noncredit knowledge checks.
-- Apply only in isolated database validation before enabling the runtime flag.
-- Existing trigger assessment_result_consistency calls this function by OID.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
CREATE OR REPLACE FUNCTION validate_assessment_result() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; expected numeric(12,4); earned numeric(12,4); n_items integer; n_scored integer; prior record;
BEGIN
 SELECT state INTO a FROM assessment_attempts WHERE id=NEW.attempt_id;
 IF a.state NOT IN ('submitted','scored','finalized') THEN
    RAISE EXCEPTION 'Result cannot be recorded before assessment submission'; END IF;
 IF NEW.result_revision=1 AND NEW.supersedes_id IS NOT NULL THEN
   RAISE EXCEPTION 'First assessment result cannot supersede a prior result'; END IF;
 IF NEW.result_revision>1 THEN
   SELECT attempt_id,result_revision INTO prior FROM assessment_attempt_results WHERE id=NEW.supersedes_id;
   IF prior.attempt_id IS DISTINCT FROM NEW.attempt_id OR prior.result_revision<>NEW.result_revision-1 THEN
     RAISE EXCEPTION 'Assessment result correction must supersede previous revision on same attempt'; END IF;
 END IF;
 IF NEW.result_status IN ('reviewed','finalized') THEN
   -- Only a published, noncredit, objective check can be finalized automatically.
   -- School, official, credential and human-scored assessments retain reviewer gates.
   IF NEW.reviewed_by_person_id IS NULL AND NOT (
     NEW.result_status='finalized'
     AND NEW.result_evidence->>'noncreditAutoFinalized'='v1'
     AND EXISTS (
       SELECT 1
       FROM assessment_attempts attempt
       JOIN assessment_access_grants access ON access.id=attempt.access_grant_id
       JOIN learner_course_attempts course ON course.id=access.course_attempt_id
       JOIN noncredit_registrations registration ON registration.id=course.noncredit_registration_id
       JOIN noncredit_training_versions training ON training.id=registration.training_version_id
       JOIN assessment_administrations administration ON administration.id=attempt.administration_id
       JOIN assessment_versions version ON version.id=administration.assessment_version_id
       JOIN assessment_definitions definition ON definition.id=version.assessment_id
       WHERE attempt.id=NEW.attempt_id
         AND attempt.state='scored'
         AND access.access_status='approved'
         AND access.learner_id=attempt.learner_id
         AND registration.learner_id=attempt.learner_id
         AND course.status='active' AND course.enrollment_id IS NULL
         AND course.section_id IS NULL
         AND registration.status IN ('registered','active')
         AND registration.deployment_id=course.deployment_id
         AND training.state='published'
         AND training.assessment_version_id=administration.assessment_version_id
         AND administration.deployment_id=course.deployment_id
         AND administration.course_version_id=course.course_version_id
         AND administration.administering_organization_id=training.provider_organization_id
         AND administration.proctor_policy='none'
         AND administration.status='open'
         AND version.lifecycle='published'
         AND definition.purpose IN ('formative','practice','readiness','mastery')
         AND NOT EXISTS (
           SELECT 1 FROM assessment_attempt_items ai
           JOIN assessment_item_versions item ON item.id=ai.item_version_id
           WHERE ai.attempt_id=attempt.id
             AND (
               item.response_kind NOT IN ('single_select','multi_select','true_false')
               OR NOT EXISTS (
                 SELECT 1 FROM assessment_item_scoring_decisions scoring
                 WHERE scoring.attempt_item_id=ai.id
                   AND scoring.scoring_kind='automated'
                   AND scoring.scoring_engine_version='can-noncredit-objective-v1'
                   AND NOT EXISTS (
                     SELECT 1 FROM assessment_item_scoring_decisions newer
                     WHERE newer.attempt_item_id=ai.id
                       AND newer.decision_order>scoring.decision_order
                   )
               )
             )
         )
     )
   ) THEN
     RAISE EXCEPTION 'Reviewed/final result requires an accountable reviewer'; END IF;
   SELECT count(*),sum(points_available) INTO n_items,expected
     FROM assessment_attempt_items WHERE attempt_id=NEW.attempt_id;
   IF n_items=0 THEN RAISE EXCEPTION 'Result cannot finalize an empty assessment'; END IF;
   SELECT count(*),coalesce(sum(score),0) INTO n_scored,earned FROM (
     SELECT DISTINCT ON (ai.id) ai.id, sd.score
     FROM assessment_attempt_items ai
     JOIN assessment_item_scoring_decisions sd ON sd.attempt_item_id=ai.id
     WHERE ai.attempt_id=NEW.attempt_id
     ORDER BY ai.id,sd.decision_order DESC
   ) scored;
   IF n_items<>n_scored OR NEW.points_possible<>expected OR NEW.points_earned<>earned THEN
     RAISE EXCEPTION 'Assessment result must equal complete item-level scoring'; END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
