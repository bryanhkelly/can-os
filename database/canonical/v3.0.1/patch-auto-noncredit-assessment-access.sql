-- Existing canonical 3.0.1 enrollment: provision noncredit assessment access from
-- active course participation + published, approved provider training only.
-- Review and run in an isolated database before production deployment.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
-- Idempotent assessment provisioning follows an approved registration and published
-- provider-owned training. It never creates School enrollment, grades or credits.
-- The published training approver is the accountable authorizing principal.
CREATE OR REPLACE FUNCTION v301_provision_noncredit_knowledge_access(p_attempt uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $v301_auto_assessment$
DECLARE rec record; administration_id uuid; administration_count integer; person_learner uuid;
BEGIN
 SELECT ca.id,ca.deployment_id,ca.course_version_id,ca.status,
        ca.offering_version_id,ca.adoption_id,
        r.id AS registration_id,r.participant_person_id,r.learner_id AS registration_learner_id,
        r.status AS registration_status,
        t.assessment_version_id,t.provider_organization_id,t.approved_by_person_id
 INTO rec
 FROM learner_course_attempts ca
 JOIN noncredit_registrations r
   ON r.id=ca.noncredit_registration_id
   AND r.deployment_id=ca.deployment_id
   AND r.adoption_id=ca.adoption_id
   AND r.offering_version_id=ca.offering_version_id
 JOIN noncredit_training_versions t
   ON t.id=r.training_version_id AND t.offering_version_id=ca.offering_version_id
 WHERE ca.id=p_attempt
   AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
   AND ca.status='active'
   AND r.status IN ('registered','active')
   AND t.state='published' AND t.assessment_version_id IS NOT NULL
   AND t.approved_by_person_id IS NOT NULL;

 IF NOT FOUND THEN RETURN; END IF;
 SELECT count(*),min(ad.id) INTO administration_count,administration_id
 FROM assessment_administrations ad
 JOIN assessment_versions version ON version.id=ad.assessment_version_id
 JOIN assessment_definitions definition ON definition.id=version.assessment_id
 JOIN assessment_form_versions form ON form.id=ad.form_version_id
 WHERE ad.assessment_version_id=rec.assessment_version_id
   AND ad.deployment_id=rec.deployment_id
   AND ad.course_version_id=rec.course_version_id
   AND ad.administering_organization_id=rec.provider_organization_id
   AND ad.status='open' AND ad.proctor_policy='none'
   AND version.lifecycle='published'
   AND form.lifecycle='published'
   AND definition.purpose IN ('formative','practice','readiness','mastery');
 IF administration_count<>1 THEN RETURN; END IF;

 INSERT INTO learner_profiles(person_id)
 VALUES(rec.participant_person_id)
 ON CONFLICT(person_id) DO NOTHING;
 SELECT id INTO person_learner FROM learner_profiles
 WHERE person_id=rec.participant_person_id;
 IF rec.registration_learner_id IS NOT NULL
    AND rec.registration_learner_id IS DISTINCT FROM person_learner THEN
   RAISE EXCEPTION 'Noncredit registration is assigned to another learner';
 END IF;
 UPDATE noncredit_registrations SET learner_id=person_learner
 WHERE id=rec.registration_id AND learner_id IS NULL;
 -- Never reopen a revoked grant; conflict means preserve its existing status.
 INSERT INTO assessment_access_grants
   (administration_id,learner_id,course_attempt_id,granted_by_person_id,access_status)
 VALUES(administration_id,person_learner,p_attempt,rec.approved_by_person_id,'approved')
 ON CONFLICT (administration_id,learner_id,course_attempt_id) DO NOTHING;
END $v301_auto_assessment$;

CREATE OR REPLACE FUNCTION v301_noncredit_attempt_access_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $v301_attempt_provision$
BEGIN
 IF NEW.noncredit_registration_id IS NOT NULL AND NEW.enrollment_id IS NULL
    AND NEW.status='active' THEN
   PERFORM v301_provision_noncredit_knowledge_access(NEW.id);
 END IF;
 RETURN NEW;
END $v301_attempt_provision$;
CREATE TRIGGER v301_noncredit_attempt_assessment_access
AFTER INSERT OR UPDATE OF noncredit_registration_id,status
ON learner_course_attempts
FOR EACH ROW EXECUTE FUNCTION v301_noncredit_attempt_access_trigger();

-- When the approved administration opens after the learner enrolled, fill
-- only course attempts for this exact deployment, course and version.
CREATE OR REPLACE FUNCTION v301_noncredit_admin_access_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $v301_admin_provision$
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
       AND t.assessment_version_id=NEW.assessment_version_id
       AND t.provider_organization_id=NEW.administering_organization_id
   LOOP
     PERFORM v301_provision_noncredit_knowledge_access(attempt_row.id);
   END LOOP;
 END IF;
 RETURN NEW;
END $v301_admin_provision$;
CREATE TRIGGER v301_noncredit_admin_assessment_access
AFTER INSERT OR UPDATE OF status,assessment_version_id
ON assessment_administrations
FOR EACH ROW EXECUTE FUNCTION v301_noncredit_admin_access_trigger();
REVOKE ALL ON FUNCTION v301_provision_noncredit_knowledge_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_noncredit_attempt_access_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_noncredit_admin_access_trigger() FROM PUBLIC;
-- Backfill previously registered participants idempotently.
DO $noncredit_access_backfill$
DECLARE p record;
BEGIN
 FOR p IN
   SELECT ca.id FROM learner_course_attempts ca
   JOIN noncredit_registrations r ON r.id=ca.noncredit_registration_id
   WHERE ca.enrollment_id IS NULL AND ca.section_id IS NULL
     AND ca.status='active' AND r.status IN ('registered','active')
 LOOP
   PERFORM v301_provision_noncredit_knowledge_access(p.id);
 END LOOP;
END $noncredit_access_backfill$;
COMMIT;
