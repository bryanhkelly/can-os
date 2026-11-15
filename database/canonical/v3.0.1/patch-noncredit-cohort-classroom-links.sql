-- Four-week cohorts link ONLY to authoritative Release 3 delivery sessions.
-- No parallel classroom calendar or attendance store is introduced.
-- Apply after patch-noncredit-self-enrollment.sql and
-- patch-facilitated-classroom-plans.sql. Do not run on production without
-- independent migration approval and verified browser acceptance.
BEGIN;
ALTER TABLE education_v30.facilitated_classroom_plans
  ADD COLUMN IF NOT EXISTS enrollment_release_id uuid
    REFERENCES education_v30.noncredit_self_enrollment_releases(id);
CREATE INDEX IF NOT EXISTS facilitated_plans_release_idx
  ON education_v30.facilitated_classroom_plans (enrollment_release_id,state);

-- The database also rejects invalid association from privileged application
-- code. Enrollment Release is the cohort's registration window; DeliverySession
-- remains the one source of meeting start/end/modality/site information.
CREATE OR REPLACE FUNCTION education_v30.verify_noncredit_plan_release()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enrollment_release_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM education_v30.noncredit_self_enrollment_releases r
    WHERE r.id=NEW.enrollment_release_id
      AND r.delivery_mode='facilitated'
      AND r.site_id=NEW.site_id
      AND r.deployment_id=NEW.deployment_id
      AND r.course_version_id=NEW.course_version_id
      AND r.registering_organization_id=NEW.host_organization_id
  ) THEN
    RAISE EXCEPTION 'Classroom plan and enrollment release scope mismatch'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='facilitated_plan_release_guard'
      AND tgrelid='education_v30.facilitated_classroom_plans'::regclass
  ) THEN
    CREATE TRIGGER facilitated_plan_release_guard
      BEFORE INSERT OR UPDATE ON education_v30.facilitated_classroom_plans
      FOR EACH ROW EXECUTE FUNCTION education_v30.verify_noncredit_plan_release();
  END IF;
END $$;
COMMIT;
