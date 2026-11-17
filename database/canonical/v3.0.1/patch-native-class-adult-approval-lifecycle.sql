-- Canonical native Class: separate adult approval from final learner acceptance.
-- Apply only after patch-native-class-enrollment-authority-ws2.sql.
-- Enrollment and Course Attempt remain created atomically by enrollInNativeClass.
-- No broad grants or RLS bypasses are introduced.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE education_v30.class_enrollment_approval_requests
 DROP CONSTRAINT IF EXISTS ws2_approval_terminal_contract;

ALTER TABLE education_v30.class_enrollment_approval_requests
 ADD CONSTRAINT ws2_approval_terminal_contract CHECK(
  (state='pending' AND reviewed_at IS NULL AND
   reviewed_by_person_id IS NULL AND accepted_enrollment_id IS NULL)
  OR
  (state='approved' AND reviewed_at IS NOT NULL AND
   reviewed_by_person_id IS NOT NULL AND
   length(trim(coalesce(decision_reason,'')))>=3)
  OR
  (state IN ('rejected','withdrawn','expired') AND
   reviewed_at IS NOT NULL AND accepted_enrollment_id IS NULL)
 );
ALTER TABLE education_v30.class_enrollment_approval_requests
 ADD CONSTRAINT ws2_approval_acceptance_only_after_review CHECK(
  accepted_enrollment_id IS NULL OR
  (state='approved' AND reviewed_at IS NOT NULL AND
   reviewed_by_person_id IS NOT NULL)
 );

-- Existing forced RLS and restricted neondb_owner policy remain unchanged.
COMMIT;
