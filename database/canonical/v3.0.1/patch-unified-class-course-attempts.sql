-- Native Class Enrollment → authoritative Course Attempt source.
-- Requires patch-unified-class-offerings.sql first.
-- This is a NEW native model, not a backfill or a compatibility adapter.
-- Only execute on a reviewed isolated canonical database. Production is untouched.
BEGIN;

ALTER TABLE education_v30.learner_course_attempts
  ADD COLUMN IF NOT EXISTS class_enrollment_id uuid
    REFERENCES education_v30.class_enrollments(id);

CREATE UNIQUE INDEX IF NOT EXISTS native_course_attempt_class_seq_uq
  ON education_v30.learner_course_attempts(class_enrollment_id,course_version_id,attempt_no)
  WHERE class_enrollment_id IS NOT NULL;

-- The canonical fresh-install v3.0.1 table has an anonymous check:
-- num_nonnulls(enrollment_id, noncredit_registration_id)=1.
-- Replace precisely this check with a three-source transitional SQL constraint;
-- new product commands use ONLY class_enrollment_id. No legacy adapters.
DO $source_check$
DECLARE c record; matching integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='education_v30.learner_course_attempts'::regclass
      AND conname='native_course_attempt_one_source_ck') THEN
  SELECT count(*) INTO matching
  FROM pg_constraint
  WHERE conrelid='education_v30.learner_course_attempts'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%num_nonnulls%'
    AND pg_get_constraintdef(oid) ILIKE '%enrollment_id%'
    AND pg_get_constraintdef(oid) ILIKE '%noncredit_registration_id%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%class_enrollment_id%';
  IF matching<>1 THEN
    RAISE EXCEPTION 'Expected precisely one original Course Attempt source check, found %',matching;
  END IF;
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='education_v30.learner_course_attempts'::regclass
      AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%num_nonnulls%'
      AND pg_get_constraintdef(oid) ILIKE '%enrollment_id%'
      AND pg_get_constraintdef(oid) ILIKE '%noncredit_registration_id%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%class_enrollment_id%'
  LOOP
    EXECUTE format('ALTER TABLE education_v30.learner_course_attempts DROP CONSTRAINT %I',c.conname);
  END LOOP;
  ALTER TABLE education_v30.learner_course_attempts
    ADD CONSTRAINT native_course_attempt_one_source_ck
      CHECK(num_nonnulls(enrollment_id,noncredit_registration_id,class_enrollment_id)=1);
 END IF;
END $source_check$;

-- Native attempt source validation. Existing academic/noncredit sources are NOT
-- used by the new Class Enrollment services, but remain physically present
-- until a separate full replacement schema is deployed.
CREATE OR REPLACE FUNCTION education_v30.validate_course_attempt_source()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $guard$
DECLARE participation_status text; training_state text;
        class_row record;
BEGIN
 IF NEW.class_enrollment_id IS NOT NULL THEN
   SELECT e.status AS enrollment_state,
      c.state AS class_state,c.deployment_id,c.adoption_id,
      c.offering_version_id,c.course_version_id
     INTO class_row
   FROM class_enrollments e JOIN classes c ON c.id=e.class_id
   WHERE e.id=NEW.class_enrollment_id;
   IF NOT FOUND OR class_row.enrollment_state<>'active'
     OR class_row.class_state<>'active'
     OR NEW.deployment_id<>class_row.deployment_id
     OR NEW.adoption_id<>class_row.adoption_id
     OR NEW.offering_version_id<>class_row.offering_version_id
     OR NEW.course_version_id<>class_row.course_version_id
     OR NEW.section_id IS NOT NULL THEN
     RAISE EXCEPTION 'Course Attempt requires one active, matching Class Enrollment'
       USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 -- Existing rows may still exist until the clean native cutover; there is
 -- no conversion or API fallback in the new product.
 IF NEW.enrollment_id IS NOT NULL THEN
   SELECT status INTO participation_status FROM enrollments
   WHERE id=NEW.enrollment_id AND deployment_id=NEW.deployment_id;
   IF participation_status IS NULL OR participation_status NOT IN ('active','completed') THEN
     RAISE EXCEPTION 'Course Attempt requires an active school enrollment';
   END IF;
 ELSE
   SELECT r.status,t.state INTO participation_status,training_state
   FROM noncredit_registrations r JOIN noncredit_training_versions t ON t.id=r.training_version_id
   WHERE r.id=NEW.noncredit_registration_id
     AND r.deployment_id=NEW.deployment_id
     AND r.adoption_id=NEW.adoption_id
     AND r.offering_version_id=NEW.offering_version_id
     AND EXISTS (SELECT 1 FROM offering_courses oc
       WHERE oc.offering_version_id=r.offering_version_id
         AND oc.course_version_id=NEW.course_version_id);
   IF participation_status IS NULL OR participation_status NOT IN ('registered','active')
      OR training_state IS DISTINCT FROM 'published' THEN
     RAISE EXCEPTION 'Course Attempt requires active registered training';
   END IF;
 END IF;
 RETURN NEW;
END $guard$;

DROP TRIGGER IF EXISTS learner_course_attempt_source_gate
 ON education_v30.learner_course_attempts;
CREATE TRIGGER learner_course_attempt_source_gate
  BEFORE INSERT OR UPDATE OF class_enrollment_id,enrollment_id,noncredit_registration_id,
  deployment_id,adoption_id,offering_version_id,course_version_id,status
  ON education_v30.learner_course_attempts
  FOR EACH ROW EXECUTE FUNCTION education_v30.validate_course_attempt_source();

-- Class Enrollment may be linked only to its exact Course Attempt, never to
-- a Course Attempt from a different learner, deployment or Course.
CREATE OR REPLACE FUNCTION education_v30.validate_class_enrollment_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $guard$
DECLARE found_attempt boolean;
BEGIN
 IF NEW.course_attempt_id IS NULL THEN RETURN NEW; END IF;
 SELECT true INTO found_attempt
 FROM learner_course_attempts a
 JOIN classes c ON c.id=NEW.class_id
 WHERE a.id=NEW.course_attempt_id AND a.class_enrollment_id=NEW.id
   AND a.course_version_id=c.course_version_id
   AND a.deployment_id=c.deployment_id
   AND a.adoption_id=c.adoption_id
   AND a.offering_version_id=c.offering_version_id;
 IF found_attempt IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Class Enrollment Course Attempt provenance mismatch'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $guard$;
DROP TRIGGER IF EXISTS class_enrollment_attempt_guard
 ON education_v30.class_enrollments;
CREATE TRIGGER class_enrollment_attempt_guard
 BEFORE INSERT OR UPDATE OF course_attempt_id,class_id,class_offering_version_id
 ON education_v30.class_enrollments
 FOR EACH ROW EXECUTE FUNCTION education_v30.validate_class_enrollment_attempt();

-- Native source link is unique: one independent Course Attempt per
-- Class Enrollment per attempt number. The Class Enrollment pointer identifies
-- the currently selected attempt (and can be changed only by governed commands).
CREATE UNIQUE INDEX IF NOT EXISTS native_class_enrollment_attempt_pointer_uq
  ON education_v30.class_enrollments(course_attempt_id)
  WHERE course_attempt_id IS NOT NULL;

COMMIT;
