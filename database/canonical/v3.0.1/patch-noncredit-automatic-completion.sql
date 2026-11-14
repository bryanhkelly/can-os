-- Activate opt-in rules-driven noncredit completion on an ISOLATED v3.0.1 branch.
-- Requires patch-noncredit-locked-policy.sql and verified completion gate first.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
-- Rules-driven completion is an explicitly provider-approved policy action.
-- Automatic decisions use the policy approver as the authorizing principal,
-- while decision_source and system-attributed audit events record automation.
-- This function never writes school assessments, credits or credentials.
CREATE OR REPLACE FUNCTION v301_try_auto_complete_noncredit(p_registration uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $noncredit_auto_completion$
DECLARE reg record; pol record; at timestamptz:=clock_timestamp();
        verified_minutes bigint:=0; matched_result uuid; new_decision uuid;
BEGIN
 SELECT r.*,t.state AS training_state,t.assessment_version_id AS training_assessment_id,
        t.provider_organization_id
 INTO reg FROM noncredit_registrations r
 JOIN noncredit_training_versions t ON t.id=r.training_version_id
 WHERE r.id=p_registration FOR UPDATE OF r;
 IF NOT FOUND OR reg.completion_policy_id IS NULL
   OR reg.status NOT IN ('registered','active')
   OR reg.training_state<>'published' THEN RETURN NULL; END IF;
 SELECT * INTO pol FROM noncredit_completion_policies
 WHERE id=reg.completion_policy_id AND training_version_id=reg.training_version_id
   AND effective_at<=at AND completion_mode='automatic';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM noncredit_completion_decisions d
   WHERE d.registration_id=p_registration) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM learner_course_attempts ca
   WHERE ca.noncredit_registration_id=p_registration
     AND ca.status='active' AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
     AND ca.deployment_id=reg.deployment_id AND ca.adoption_id=reg.adoption_id
     AND ca.offering_version_id=reg.offering_version_id) THEN RETURN NULL; END IF;

 -- Independent documentary verification is mandatory only for configured time.
 SELECT coalesce(sum(e.counted_minutes),0)::bigint INTO verified_minutes
 FROM noncredit_participation_events e
 JOIN evidence_document_versions v ON v.id=e.evidence_version_id
 WHERE e.registration_id=p_registration
  AND e.event_kind<>'attendance_corrected' AND e.counted_minutes>0
  AND e.occurred_at<=at
  AND v.verified_at IS NOT NULL AND v.verified_by_person_id IS NOT NULL
  AND v.verified_at<=at
  AND (v.valid_from IS NULL OR v.valid_from<=at::date)
  AND (v.valid_through IS NULL OR v.valid_through>=at::date)
  AND NOT EXISTS(SELECT 1 FROM noncredit_participation_events newer
    WHERE newer.supersedes_id=e.id);
 IF verified_minutes<pol.min_participation_minutes THEN RETURN NULL; END IF;

 IF pol.require_all_lessons AND NOT EXISTS (
   SELECT 1 FROM learner_course_attempts ca
   JOIN course_lessons l ON l.course_version_id=ca.course_version_id
   LEFT JOIN learner_lesson_progress lp
     ON lp.course_attempt_id=ca.id AND lp.lesson_id=l.id AND lp.status='completed'
   WHERE ca.noncredit_registration_id=p_registration
     AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
     AND ca.status IN ('active','completed')
     AND ca.offering_version_id=reg.offering_version_id
   GROUP BY ca.id
   HAVING count(l.id)>0 AND count(lp.lesson_id)=count(l.id)
 ) THEN RETURN NULL; END IF;

 IF pol.skills_assessment_required THEN
   SELECT result.id INTO matched_result
   FROM assessment_attempt_results result
   JOIN assessment_attempts a ON a.id=result.attempt_id AND a.state='finalized'
   JOIN assessment_access_grants grant_row
     ON grant_row.id=a.access_grant_id
       AND grant_row.administration_id=a.administration_id
       AND grant_row.learner_id=a.learner_id
       AND grant_row.access_status='approved'
   JOIN learner_course_attempts ca
     ON ca.id=grant_row.course_attempt_id
       AND ca.noncredit_registration_id=p_registration
       AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
   JOIN assessment_administrations admin
     ON admin.id=a.administration_id
       AND admin.deployment_id=ca.deployment_id
       AND admin.course_version_id=ca.course_version_id
   WHERE a.learner_id=reg.learner_id
     AND admin.assessment_version_id=reg.training_assessment_id
     AND result.result_status='finalized' AND result.points_possible>0
     AND result.points_earned/result.points_possible>=pol.minimum_assessment_fraction
     AND NOT EXISTS(SELECT 1 FROM assessment_attempt_results newer
       WHERE newer.supersedes_id=result.id)
   ORDER BY result.calculated_at DESC,result.id LIMIT 1;
   IF matched_result IS NULL THEN RETURN NULL; END IF;
 END IF;
 INSERT INTO noncredit_completion_decisions(
  registration_id,policy_id,assessment_result_id,
  outcome,decision_source,decided_by_person_id)
 VALUES(p_registration,pol.id,matched_result,'completed','automatic',pol.approved_by_person_id)
 RETURNING id INTO new_decision;
 INSERT INTO audit_events(
   actor_person_id,owning_organization_id,event_code,entity_kind,entity_id,payload)
 VALUES(NULL,reg.provider_organization_id,'noncredit.completion.automatic',
   'noncredit_completion_decision',new_decision,
   jsonb_build_object('registrationId',p_registration,'policyId',pol.id,
     'authorizedByPersonId',pol.approved_by_person_id,'decisionSource','automatic'));
 INSERT INTO domain_events(event_type,aggregate_type,aggregate_id,actor_person_id,payload)
 VALUES('NoncreditTrainingCompleted','noncredit_completion_decision',
   new_decision,NULL,
   jsonb_build_object('registrationId',p_registration,'policyId',pol.id,
     'decisionSource','automatic'));
 RETURN new_decision;
END $noncredit_auto_completion$;

CREATE OR REPLACE FUNCTION v301_auto_complete_noncredit_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $auto_event$
DECLARE registration uuid;
BEGIN
 IF TG_TABLE_NAME='noncredit_participation_events' THEN
   registration:=NEW.registration_id;
 ELSIF TG_TABLE_NAME='learner_lesson_progress' THEN
   IF NEW.status<>'completed' THEN RETURN NEW; END IF;
   SELECT ca.noncredit_registration_id INTO registration
   FROM learner_course_attempts ca WHERE ca.id=NEW.course_attempt_id;
 ELSIF TG_TABLE_NAME='assessment_attempts' THEN
   IF NEW.state<>'finalized' THEN RETURN NEW; END IF;
   SELECT ca.noncredit_registration_id INTO registration
   FROM assessment_access_grants grant_row
   JOIN learner_course_attempts ca ON ca.id=grant_row.course_attempt_id
   WHERE grant_row.id=NEW.access_grant_id;
 ELSIF TG_TABLE_NAME='learner_course_attempts' THEN
   IF NEW.status<>'active' OR NEW.enrollment_id IS NOT NULL THEN RETURN NEW; END IF;
   registration:=NEW.noncredit_registration_id;
 END IF;
 IF registration IS NOT NULL THEN
   PERFORM v301_try_auto_complete_noncredit(registration);
 END IF;
 RETURN NEW;
END $auto_event$;

CREATE TRIGGER v301_noncredit_auto_on_participation
 AFTER INSERT ON noncredit_participation_events
 FOR EACH ROW EXECUTE FUNCTION v301_auto_complete_noncredit_event();
CREATE TRIGGER v301_noncredit_auto_on_lesson
 AFTER INSERT OR UPDATE OF status ON learner_lesson_progress
 FOR EACH ROW EXECUTE FUNCTION v301_auto_complete_noncredit_event();
CREATE TRIGGER v301_noncredit_auto_on_assessment
 AFTER UPDATE OF state ON assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION v301_auto_complete_noncredit_event();
CREATE TRIGGER v301_noncredit_auto_on_course
 AFTER INSERT OR UPDATE OF status ON learner_course_attempts
 FOR EACH ROW EXECUTE FUNCTION v301_auto_complete_noncredit_event();

-- Evidence sometimes becomes verified after the attendance entry was recorded.
CREATE OR REPLACE FUNCTION v301_auto_complete_on_evidence_verification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $auto_evidence$
DECLARE r record;
BEGIN
 IF NEW.verified_at IS NOT NULL AND NEW.verified_by_person_id IS NOT NULL THEN
  FOR r IN SELECT DISTINCT e.registration_id
   FROM noncredit_participation_events e WHERE e.evidence_version_id=NEW.id
  LOOP
   PERFORM v301_try_auto_complete_noncredit(r.registration_id);
  END LOOP;
 END IF;
 RETURN NEW;
END $auto_evidence$;
CREATE TRIGGER v301_noncredit_auto_on_evidence
 AFTER UPDATE OF verified_at,verified_by_person_id,valid_from,valid_through
 ON evidence_document_versions
 FOR EACH ROW EXECUTE FUNCTION v301_auto_complete_on_evidence_verification();
REVOKE ALL ON FUNCTION v301_try_auto_complete_noncredit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_auto_complete_noncredit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_auto_complete_on_evidence_verification() FROM PUBLIC;
COMMIT;
