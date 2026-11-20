-- A learner registers for a Course and is placed into a Class.
-- Preserve the original noncredit Registration and its existing ONE Course Attempt.
-- Both references on the SAME Attempt are permitted only with exact source scope.
-- Public is the canonical write schema; do not revive education_v30 tables.
DO $guard$
DECLARE source_constraint record; source_count integer;
BEGIN
  IF to_regclass('public.learner_course_attempts') IS NULL
     OR to_regclass('public.class_enrollments') IS NULL
     OR to_regclass('public.noncredit_registrations') IS NULL
     OR to_regclass('public.noncredit_self_enrollment_claims') IS NULL
     OR to_regclass('public.noncredit_self_enrollment_releases') IS NULL THEN
    RAISE EXCEPTION 'Course registration Class placement requires consolidated public tables';
  END IF;
  SELECT count(*) INTO source_count FROM pg_constraint
  WHERE conrelid='public.learner_course_attempts'::regclass AND contype='c'
    AND (
      conname='native_course_attempt_one_source_ck'
      OR (pg_get_constraintdef(oid) ILIKE '%num_nonnulls%'
          AND pg_get_constraintdef(oid) ILIKE '%noncredit_registration_id%'
          AND pg_get_constraintdef(oid) ILIKE '%class_enrollment_id%')
    );
  IF source_count<>1 THEN
    RAISE EXCEPTION 'Expected one canonical Course Attempt source constraint, found %',source_count;
  END IF;
  FOR source_constraint IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.learner_course_attempts'::regclass AND contype='c'
      AND (
        conname='native_course_attempt_one_source_ck'
        OR (pg_get_constraintdef(oid) ILIKE '%num_nonnulls%'
            AND pg_get_constraintdef(oid) ILIKE '%noncredit_registration_id%'
            AND pg_get_constraintdef(oid) ILIKE '%class_enrollment_id%')
      )
  LOOP
    EXECUTE format('ALTER TABLE public.learner_course_attempts DROP CONSTRAINT %I',source_constraint.conname);
  END LOOP;
  ALTER TABLE public.learner_course_attempts
    ADD CONSTRAINT course_attempt_one_registration_with_optional_class_ck
      CHECK (
        num_nonnulls(enrollment_id,noncredit_registration_id,class_enrollment_id)=1
        OR (enrollment_id IS NULL AND noncredit_registration_id IS NOT NULL
            AND class_enrollment_id IS NOT NULL)
      );
END $guard$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.validate_course_registration_class_placement()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_catalog AS $check$
BEGIN
  IF NEW.noncredit_registration_id IS NOT NULL AND NEW.class_enrollment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.noncredit_registrations r
      JOIN public.noncredit_self_enrollment_claims claim
        ON claim.registration_id=r.id
      JOIN public.noncredit_self_enrollment_releases release
        ON release.id=claim.release_id
      JOIN public.class_enrollments ce
        ON ce.id=NEW.class_enrollment_id
      JOIN public.classes cls
        ON cls.id=ce.class_id
      WHERE r.id=NEW.noncredit_registration_id
        AND r.participant_person_id=ce.learner_person_id
        AND r.participant_person_id=claim.participant_person_id
        AND ce.enrolled_by_person_id=r.participant_person_id
        AND ce.status='active' AND ce.enrollment_method='self'
        AND ce.credit_mode='not_applicable'
        AND cls.state='active'
        AND r.status IN ('registered','active')
        AND cls.operating_organization_id=r.registering_organization_id
        AND cls.site_id=release.site_id
        AND cls.deployment_id=r.deployment_id
        AND cls.adoption_id=r.adoption_id
        AND cls.offering_version_id=r.offering_version_id
        AND cls.course_version_id=NEW.course_version_id
        AND release.deployment_id=r.deployment_id
        AND release.adoption_id=r.adoption_id
        AND release.offering_version_id=r.offering_version_id
        AND release.course_version_id=NEW.course_version_id
        AND NEW.deployment_id=r.deployment_id
        AND NEW.adoption_id=r.adoption_id
        AND NEW.offering_version_id=r.offering_version_id
        AND NEW.section_id IS NULL
    ) THEN
      RAISE EXCEPTION 'Course Attempt Class placement provenance mismatch'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $check$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS course_registration_class_placement_guard
  ON public.learner_course_attempts;
--> statement-breakpoint
CREATE TRIGGER course_registration_class_placement_guard
  BEFORE INSERT OR UPDATE OF class_enrollment_id,noncredit_registration_id,
     enrollment_id,deployment_id,adoption_id,offering_version_id,course_version_id,status
  ON public.learner_course_attempts
  FOR EACH ROW EXECUTE FUNCTION public.validate_course_registration_class_placement();
