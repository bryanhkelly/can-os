-- Optional noncredit baseline diagnostic, never an official grade or credit.
-- Apply after the automatic objective result gate and course-grant migration.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
ALTER TABLE noncredit_training_versions
 ADD COLUMN IF NOT EXISTS baseline_assessment_version_id uuid
 REFERENCES assessment_versions(id);
CREATE OR REPLACE FUNCTION v301_provision_noncredit_knowledge_access(p_attempt uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog,pg_temp AS $v301_auto_assessment$
DECLARE rec record; administration_id uuid; administration_count integer;
        person_learner uuid; candidate_version uuid;
BEGIN
 SELECT ca.id,ca.deployment_id,ca.course_version_id,ca.status,
        ca.offering_version_id,ca.adoption_id,
        r.id AS registration_id,r.participant_person_id,r.learner_id AS registration_learner_id,
        r.status AS registration_status,
        t.assessment_version_id,t.baseline_assessment_version_id,
        t.provider_organization_id,t.approved_by_person_id
 INTO rec
 FROM learner_course_attempts ca
 JOIN noncredit_registrations r
   ON r.id=ca.noncredit_registration_id AND r.deployment_id=ca.deployment_id
   AND r.adoption_id=ca.adoption_id AND r.offering_version_id=ca.offering_version_id
 JOIN noncredit_training_versions t
   ON t.id=r.training_version_id AND t.offering_version_id=ca.offering_version_id
 WHERE ca.id=p_attempt
   AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
   AND ca.status='active' AND r.status IN ('registered','active')
   AND t.state='published' AND t.approved_by_person_id IS NOT NULL
   AND (t.assessment_version_id IS NOT NULL OR t.baseline_assessment_version_id IS NOT NULL);
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO learner_profiles(person_id)
 VALUES(rec.participant_person_id) ON CONFLICT(person_id) DO NOTHING;
 SELECT id INTO person_learner FROM learner_profiles WHERE person_id=rec.participant_person_id;
 IF rec.registration_learner_id IS NOT NULL
    AND rec.registration_learner_id IS DISTINCT FROM person_learner THEN
   RAISE EXCEPTION 'Noncredit registration is assigned to another learner';
 END IF;
 UPDATE noncredit_registrations SET learner_id=person_learner
 WHERE id=rec.registration_id AND learner_id IS NULL;

 FOR candidate_version IN SELECT DISTINCT phase_version.id FROM unnest(ARRAY[
   rec.assessment_version_id,rec.baseline_assessment_version_id
 ]) AS phase_version(id) WHERE phase_version.id IS NOT NULL LOOP
   SELECT count(*),min(ad.id) INTO administration_count,administration_id
   FROM assessment_administrations ad
   JOIN assessment_versions av ON av.id=ad.assessment_version_id
   JOIN assessment_definitions definition ON definition.id=av.assessment_id
   JOIN assessment_form_versions form ON form.id=ad.form_version_id
   WHERE ad.assessment_version_id=candidate_version
     AND ad.deployment_id=rec.deployment_id
     AND ad.course_version_id=rec.course_version_id
     AND ad.administering_organization_id=rec.provider_organization_id
     AND ad.status='open' AND ad.proctor_policy='none'
     AND av.lifecycle='published' AND form.lifecycle='published'
     AND (
       (candidate_version=rec.assessment_version_id
         AND definition.purpose IN ('formative','practice','readiness','mastery'))
       OR (candidate_version=rec.baseline_assessment_version_id
         AND definition.purpose='diagnostic')
     );
   IF administration_count=1 THEN
     -- Never reopen a revoked grant. Each phase has its own administration.
     INSERT INTO assessment_access_grants
       (administration_id,learner_id,course_attempt_id,granted_by_person_id,access_status)
     VALUES(administration_id,person_learner,p_attempt,rec.approved_by_person_id,'approved')
     ON CONFLICT (administration_id,learner_id,course_attempt_id) DO NOTHING;
   END IF;
 END LOOP;
END $v301_auto_assessment$;

CREATE OR REPLACE FUNCTION v301_noncredit_admin_access_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog,pg_temp AS $v301_admin_provision$
DECLARE attempt_row record;
BEGIN
 IF NEW.status='open' THEN
   FOR attempt_row IN
     SELECT ca.id
     FROM learner_course_attempts ca
     JOIN noncredit_registrations r ON r.id=ca.noncredit_registration_id
     JOIN noncredit_training_versions t ON t.id=r.training_version_id
     WHERE ca.enrollment_id IS NULL AND ca.section_id IS NULL
       AND ca.status='active' AND r.status IN ('registered','active')
       AND ca.deployment_id=NEW.deployment_id
       AND ca.course_version_id=NEW.course_version_id
       AND (t.assessment_version_id=NEW.assessment_version_id
          OR t.baseline_assessment_version_id=NEW.assessment_version_id)
       AND t.provider_organization_id=NEW.administering_organization_id
   LOOP
     PERFORM v301_provision_noncredit_knowledge_access(attempt_row.id);
   END LOOP;
 END IF;
 RETURN NEW;
END $v301_admin_provision$;
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
         AND (
           (training.assessment_version_id=administration.assessment_version_id
             AND coalesce(NEW.result_evidence->>'noncreditPhase','final')='final'
             AND definition.purpose IN ('formative','practice','readiness','mastery'))
           OR (training.baseline_assessment_version_id=administration.assessment_version_id
             AND NEW.result_evidence->>'noncreditPhase'='baseline'
             AND definition.purpose='diagnostic')
         )
         AND administration.deployment_id=course.deployment_id
         AND administration.course_version_id=course.course_version_id
         AND administration.administering_organization_id=training.provider_organization_id
         AND administration.proctor_policy='none'
         AND administration.status='open'
         AND version.lifecycle='published'
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
DO $backfill_noncredit_diagnostics$
DECLARE a record;
BEGIN
 FOR a IN SELECT ca.id FROM learner_course_attempts ca
 JOIN noncredit_registrations r ON r.id=ca.noncredit_registration_id
 WHERE ca.status='active' AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
   AND r.status IN ('registered','active')
 LOOP PERFORM v301_provision_noncredit_knowledge_access(a.id); END LOOP;
END $backfill_noncredit_diagnostics$;
COMMIT;
