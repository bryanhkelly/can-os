-- Canonical Class consent contract for all learner-accepted methods.
-- Run after the base native Class source constraints.
-- Existing assignment remains a no-consent, staff-authorized pathway.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE education_v30.class_enrollments
 DROP CONSTRAINT IF EXISTS canonical_class_enrollment_consent_ck;
ALTER TABLE education_v30.class_enrollments
 ADD CONSTRAINT canonical_class_enrollment_consent_ck CHECK (
  (
   enrollment_method IN ('self','invitation','approval')
   AND class_offering_version_id IS NOT NULL
   AND consent_version IS NOT NULL
   AND consent_sha256 IS NOT NULL
   AND consented_at IS NOT NULL
  )
  OR
  (
   enrollment_method='assignment'
   AND consent_version IS NULL
   AND consent_sha256 IS NULL
   AND consented_at IS NULL
  )
 );

ALTER TABLE education_v30.class_enrollments
 DROP CONSTRAINT IF EXISTS canonical_class_enroll_publication_ck;
ALTER TABLE education_v30.class_enrollments
 ADD CONSTRAINT canonical_class_enroll_publication_ck CHECK (
  enrollment_method='assignment' OR class_offering_version_id IS NOT NULL
 );
COMMIT;
