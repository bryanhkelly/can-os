-- Reviewed opt-in feedback dispatch; run only on isolated v3.0.1 first.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
ALTER TABLE education_v30.survey_trigger_rules
 DROP CONSTRAINT IF EXISTS survey_trigger_rules_trigger_kind_check;
ALTER TABLE education_v30.survey_trigger_rules
 ADD CONSTRAINT survey_trigger_rules_trigger_kind_check
 CHECK(trigger_kind IN (
 'enrollment_started','unit_completed','track_switched','tutoring_completed',
 'term_ended','staff_onboarded','incident_resolved','program_renewal',
 'knowledge_check_submitted'));
-- Explicit opt-in feedback campaigns receive one private in-app invitation
-- when a published noncredit Course knowledge check is submitted and scored.
CREATE OR REPLACE FUNCTION v301_invite_noncredit_knowledge_feedback(p_attempt uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $feedback$
DECLARE participant record; at timestamptz:=clock_timestamp();
BEGIN
 SELECT r.participant_person_id,r.deployment_id
 INTO participant
 FROM assessment_attempts a
 JOIN assessment_access_grants g ON g.id=a.access_grant_id
   AND g.learner_id=a.learner_id AND g.administration_id=a.administration_id
 JOIN learner_course_attempts ca ON ca.id=g.course_attempt_id
 JOIN noncredit_registrations r ON r.id=ca.noncredit_registration_id
 JOIN noncredit_training_versions t ON t.id=r.training_version_id
 JOIN assessment_administrations ad ON ad.id=a.administration_id
 WHERE a.id=p_attempt AND a.state IN ('scored','finalized')
   AND ca.enrollment_id IS NULL AND ca.section_id IS NULL AND ca.status='active'
   AND r.learner_id=a.learner_id AND r.status IN ('registered','active')
   AND r.deployment_id=ca.deployment_id
   AND t.state='published' AND t.assessment_version_id=ad.assessment_version_id
   AND ad.administering_organization_id=t.provider_organization_id
   AND ad.course_version_id=ca.course_version_id
   AND ad.deployment_id=ca.deployment_id
   AND g.access_status='approved';
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO survey_invitations(campaign_id,invited_person_id,delivery_channel,sent_at)
 SELECT c.id,participant.participant_person_id,'in_app',at
 FROM survey_campaigns c
 JOIN survey_trigger_rules rule ON rule.campaign_id=c.id
   AND rule.enabled AND rule.trigger_kind='knowledge_check_submitted'
 JOIN survey_versions v ON v.id=c.survey_version_id AND v.lifecycle='published'
 JOIN survey_definitions d ON d.id=v.survey_id AND d.status='active'
   AND d.intended_audience IN ('learner','any')
 JOIN evidence_document_versions permission ON permission.id=c.survey_permission_evidence_id
 WHERE c.deployment_id=participant.deployment_id
   AND c.status='active' AND c.response_mode='identified'
   AND c.starts_at<=at AND (c.ends_at IS NULL OR c.ends_at>at)
   AND permission.verified_by_person_id IS NOT NULL AND permission.verified_at IS NOT NULL
   AND permission.verified_at<=at
   AND (permission.valid_from IS NULL OR permission.valid_from<=at::date)
   AND (permission.valid_through IS NULL OR permission.valid_through>=at::date)
 ON CONFLICT (campaign_id,invited_person_id) DO NOTHING;
END $feedback$;
CREATE OR REPLACE FUNCTION v301_noncredit_feedback_attempt_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $feedback_trigger$
BEGIN
 IF NEW.state='scored' AND OLD.state IS DISTINCT FROM NEW.state THEN
   PERFORM v301_invite_noncredit_knowledge_feedback(NEW.id);
 END IF;
 RETURN NEW;
END $feedback_trigger$;
CREATE TRIGGER v301_noncredit_knowledge_feedback
AFTER UPDATE OF state ON assessment_attempts
FOR EACH ROW EXECUTE FUNCTION v301_noncredit_feedback_attempt_trigger();
REVOKE ALL ON FUNCTION v301_invite_noncredit_knowledge_feedback(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_noncredit_feedback_attempt_trigger() FROM PUBLIC;
COMMIT;
