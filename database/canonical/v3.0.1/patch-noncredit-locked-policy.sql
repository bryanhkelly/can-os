-- Noncredit policy pin and explicit provider-opted completion mode.
-- Migration: existing rows with no policy at registration remain unpinned,
-- never silently switched to a later/higher policy.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
ALTER TABLE noncredit_registrations ADD COLUMN IF NOT EXISTS completion_policy_id uuid;
ALTER TABLE noncredit_completion_policies ADD COLUMN IF NOT EXISTS completion_mode text
 NOT NULL DEFAULT 'provider_review' CHECK(completion_mode IN ('provider_review','automatic'));
ALTER TABLE noncredit_completion_decisions ADD COLUMN IF NOT EXISTS decision_source text
 NOT NULL DEFAULT 'provider' CHECK(decision_source IN ('provider','automatic'));
DO $policy_fk$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='noncredit_registration_locked_policy_fk'
  AND conrelid='education_v30.noncredit_registrations'::regclass) THEN
  ALTER TABLE noncredit_registrations ADD CONSTRAINT noncredit_registration_locked_policy_fk
  FOREIGN KEY(completion_policy_id,training_version_id)
  REFERENCES noncredit_completion_policies(id,training_version_id);
 END IF;
END $policy_fk$;
UPDATE noncredit_registrations r SET completion_policy_id=(
 SELECT p.id FROM noncredit_completion_policies p
 WHERE p.training_version_id=r.training_version_id
  AND p.effective_at<=r.registered_at AND p.published_at<=r.registered_at
 ORDER BY p.effective_at DESC,p.policy_version DESC LIMIT 1
) WHERE r.completion_policy_id IS NULL;
CREATE OR REPLACE FUNCTION v301_lock_noncredit_completion_policy() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $noncredit_policy_lock$
DECLARE pinned uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.training_version_id,NEW.registered_at,NEW.completion_policy_id)
     IS DISTINCT FROM ROW(OLD.training_version_id,OLD.registered_at,OLD.completion_policy_id) THEN
   RAISE EXCEPTION 'Noncredit completion requirements are immutable after registration';
  END IF;
  RETURN NEW;
 END IF;
 SELECT p.id INTO pinned
 FROM noncredit_completion_policies p
 WHERE p.training_version_id=NEW.training_version_id
  AND p.published_at<=NEW.registered_at AND p.effective_at<=NEW.registered_at
 ORDER BY p.effective_at DESC,p.policy_version DESC LIMIT 1;
 IF pinned IS NULL THEN
  RAISE EXCEPTION 'A published effective completion policy is required before noncredit registration';
 END IF;
 IF NEW.completion_policy_id IS NOT NULL AND NEW.completion_policy_id<>pinned THEN
  RAISE EXCEPTION 'Cannot override the noncredit enrollment-time completion policy';
 END IF;
 NEW.completion_policy_id:=pinned;
 RETURN NEW;
END $noncredit_policy_lock$;
CREATE TRIGGER noncredit_registration_policy_pin
 BEFORE INSERT OR UPDATE OF completion_policy_id,training_version_id,registered_at
 ON noncredit_registrations FOR EACH ROW
 EXECUTE FUNCTION v301_lock_noncredit_completion_policy();

CREATE OR REPLACE FUNCTION v28_validate_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE row_registration record; pol record; minutes_seen bigint; q record;
BEGIN
 SELECT r.*,t.assessment_version_id AS training_assessment_id INTO row_registration
 FROM noncredit_registrations r JOIN noncredit_training_versions t ON t.id=r.training_version_id
 WHERE r.id=NEW.registration_id FOR SHARE OF r;
 SELECT * INTO pol FROM noncredit_completion_policies WHERE id=NEW.policy_id;
 IF row_registration.completion_policy_id IS NULL
  OR NEW.policy_id IS DISTINCT FROM row_registration.completion_policy_id
  OR pol.training_version_id IS DISTINCT FROM row_registration.training_version_id
  OR pol.effective_at>NEW.decided_at THEN
   RAISE EXCEPTION 'Completion must use the immutable enrollment-time policy'; END IF;
 IF row_registration.status NOT IN ('registered','active') AND NEW.outcome='completed' THEN
   RAISE EXCEPTION 'Inactive noncredit registration cannot be completed'; END IF;
 IF NEW.decision_source='automatic' AND
    (pol.completion_mode<>'automatic' OR NEW.outcome<>'completed'
      OR NEW.supersedes_id IS NOT NULL
      OR NEW.decided_by_person_id IS DISTINCT FROM pol.approved_by_person_id) THEN
   RAISE EXCEPTION 'Automatic completion requires an approved automatic policy'; END IF;
 IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM noncredit_completion_decisions d
  WHERE d.id=NEW.supersedes_id AND d.registration_id=NEW.registration_id
    AND NOT EXISTS(SELECT 1 FROM noncredit_completion_decisions nx WHERE nx.supersedes_id=d.id))
 THEN RAISE EXCEPTION 'Completion correction must supersede current decision for this registration'; END IF;
 IF NEW.outcome<>'completed' THEN RETURN NEW; END IF;
 -- Only independently verified current evidence contributes minutes.
 -- Self-marked lessons, unverified uploads and replaced events contribute zero.
 SELECT coalesce(sum(e.counted_minutes),0)::bigint INTO minutes_seen
 FROM noncredit_participation_events e
 JOIN evidence_document_versions v ON v.id=e.evidence_version_id
 WHERE e.registration_id=NEW.registration_id
   AND e.event_kind<>'attendance_corrected' AND e.counted_minutes>0
   AND e.occurred_at<=NEW.decided_at
   AND v.verified_at IS NOT NULL AND v.verified_by_person_id IS NOT NULL
   AND v.verified_at<=NEW.decided_at
   AND (v.valid_from IS NULL OR v.valid_from<=NEW.decided_at::date)
   AND (v.valid_through IS NULL OR v.valid_through>=NEW.decided_at::date)
   AND NOT EXISTS (
     SELECT 1 FROM noncredit_participation_events newer WHERE newer.supersedes_id=e.id
   );
 IF minutes_seen<pol.min_participation_minutes THEN RAISE EXCEPTION 'Noncredit participation below completion threshold'; END IF;
 -- Configurable learner-marked lessons are separate from evidenced minutes.
 -- An entire matching Course attempt must contain all published lessons.
 IF pol.require_all_lessons AND NOT EXISTS (
   SELECT 1 FROM learner_course_attempts ca
   JOIN course_lessons l ON l.course_version_id=ca.course_version_id
   LEFT JOIN learner_lesson_progress lp
     ON lp.course_attempt_id=ca.id AND lp.lesson_id=l.id AND lp.status='completed'
   WHERE ca.noncredit_registration_id=NEW.registration_id
     AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
     AND ca.status IN ('active','completed')
     AND ca.offering_version_id=row_registration.offering_version_id
   GROUP BY ca.id
   HAVING count(l.id)>0 AND count(lp.lesson_id)=count(l.id)
 ) THEN RAISE EXCEPTION 'Required noncredit lessons are incomplete'; END IF;
 IF pol.skills_assessment_required THEN
  SELECT a.learner_id,admin.assessment_version_id,result.result_status,
    result.points_earned,result.points_possible INTO q
  FROM assessment_attempt_results result
  JOIN assessment_attempts a ON a.id=result.attempt_id
  JOIN assessment_access_grants grant_row ON grant_row.id=a.access_grant_id
    AND grant_row.administration_id=a.administration_id
    AND grant_row.learner_id=a.learner_id
    AND grant_row.access_status='approved'
  JOIN learner_course_attempts ca ON ca.id=grant_row.course_attempt_id
    AND ca.noncredit_registration_id=NEW.registration_id
    AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
  JOIN assessment_administrations admin ON admin.id=a.administration_id
    AND admin.deployment_id=ca.deployment_id
    AND admin.course_version_id=ca.course_version_id
  WHERE result.id=NEW.assessment_result_id AND a.state='finalized'
    AND NOT EXISTS (
      SELECT 1 FROM assessment_attempt_results newer WHERE newer.supersedes_id=result.id
    );
  IF q.learner_id IS DISTINCT FROM row_registration.learner_id
    OR q.assessment_version_id IS DISTINCT FROM row_registration.training_assessment_id
    OR q.result_status<>'finalized'
    OR q.points_possible IS NULL OR q.points_possible<=0
    OR q.points_earned/q.points_possible<pol.minimum_assessment_fraction THEN
    RAISE EXCEPTION 'Noncredit completion requires a current finalized course-bound assessment'; END IF;
 END IF;
 RETURN NEW;
END $$;

COMMIT;
