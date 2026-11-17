-- WS3 independent completion-evidence review requests.
-- STAGED / NOT APPLIED. Depends on patch-ws3-source-bound-evidence.sql.
-- Requests are authorization workflow state, not Course, Class, attendance,
-- assessment, completion, certificate or credential source-of-truth records.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
CREATE TABLE IF NOT EXISTS education_v30.learning_completion_evidence_review_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 purpose text NOT NULL CHECK (purpose IN
   ('completion_correction','award_revocation','class_completion_decision')),
 noncredit_registration_id uuid REFERENCES education_v30.noncredit_registrations(id),
 expected_decision_id uuid REFERENCES education_v30.noncredit_completion_decisions(id),
 approved_correction_outcome text CHECK(approved_correction_outcome IN ('not_yet_completed','voided')),
 award_issuance_id uuid REFERENCES education_v30.learning_award_issuances(id),
 class_enrollment_id uuid REFERENCES education_v30.class_enrollments(id),
 expected_class_outcome_id uuid REFERENCES education_v30.class_outcomes(id),
 approved_class_outcome text CHECK(approved_class_outcome IN ('completed','not_yet_completed','voided')),
 evidence_version_id uuid NOT NULL REFERENCES education_v30.evidence_document_versions(id),
 participant_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 provider_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 delivery_site_id uuid NOT NULL REFERENCES education_v30.sites(id),
 submitted_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 review_reason text NOT NULL CHECK(length(btrim(review_reason)) BETWEEN 10 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by_person_id uuid REFERENCES education_v30.persons(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT ws3_review_one_source CHECK (
   (purpose='completion_correction' AND
    noncredit_registration_id IS NOT NULL AND expected_decision_id IS NOT NULL
    AND approved_correction_outcome IS NOT NULL AND
    award_issuance_id IS NULL AND class_enrollment_id IS NULL AND
    expected_class_outcome_id IS NULL AND approved_class_outcome IS NULL)
   OR
   (purpose='award_revocation' AND award_issuance_id IS NOT NULL
    AND noncredit_registration_id IS NULL AND expected_decision_id IS NULL
    AND approved_correction_outcome IS NULL AND class_enrollment_id IS NULL
    AND expected_class_outcome_id IS NULL AND approved_class_outcome IS NULL)
   OR
   (purpose='class_completion_decision' AND
    class_enrollment_id IS NOT NULL AND approved_class_outcome IS NOT NULL
    AND noncredit_registration_id IS NULL AND expected_decision_id IS NULL
    AND approved_correction_outcome IS NULL AND award_issuance_id IS NULL)
 ),
 CONSTRAINT ws3_review_independent CHECK (
    submitted_by_person_id<>participant_person_id AND
    (status='pending' AND reviewed_at IS NULL
       AND reviewed_by_person_id IS NULL OR
     status IN ('approved','rejected') AND reviewed_at IS NOT NULL
       AND reviewed_by_person_id IS NOT NULL
       AND reviewed_by_person_id<>participant_person_id
       AND reviewed_by_person_id<>submitted_by_person_id)
 )
);
CREATE INDEX IF NOT EXISTS ws3_review_queue_idx
 ON education_v30.learning_completion_evidence_review_requests
 (provider_organization_id,delivery_site_id,status,created_at,id);

CREATE OR REPLACE FUNCTION education_v30.ws3_guard_review_request()
RETURNS trigger LANGUAGE plpgsql
SET search_path=education_v30,pg_catalog AS $guard$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Completion evidence review requests are never deleted'
     USING ERRCODE='23514';
 ELSIF TG_OP='UPDATE' THEN
   IF OLD.status<>'pending' OR
     ROW(OLD.purpose,OLD.noncredit_registration_id,OLD.expected_decision_id,
         OLD.approved_correction_outcome,OLD.award_issuance_id,
         OLD.class_enrollment_id,OLD.expected_class_outcome_id,
         OLD.approved_class_outcome,OLD.evidence_version_id,
         OLD.participant_person_id,OLD.provider_organization_id,
         OLD.delivery_site_id,OLD.submitted_by_person_id,
         OLD.review_reason,OLD.created_at)
      IS DISTINCT FROM
     ROW(NEW.purpose,NEW.noncredit_registration_id,NEW.expected_decision_id,
         NEW.approved_correction_outcome,NEW.award_issuance_id,
         NEW.class_enrollment_id,NEW.expected_class_outcome_id,
         NEW.approved_class_outcome,NEW.evidence_version_id,
         NEW.participant_person_id,NEW.provider_organization_id,
         NEW.delivery_site_id,NEW.submitted_by_person_id,
         NEW.review_reason,NEW.created_at) OR
      NEW.status NOT IN ('approved','rejected') OR
      NEW.reviewed_at>clock_timestamp() THEN
     RAISE EXCEPTION 'Only independent final review transition is permitted'
       USING ERRCODE='23514';
   END IF;
 ELSE
   IF NEW.status<>'pending' OR NEW.reviewed_by_person_id IS NOT NULL
      OR NEW.reviewed_at IS NOT NULL THEN
     RAISE EXCEPTION 'Review request must start pending'
       USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $guard$;
DROP TRIGGER IF EXISTS ws3_review_request_mutation_guard
 ON education_v30.learning_completion_evidence_review_requests;
CREATE TRIGGER ws3_review_request_mutation_guard
 BEFORE INSERT OR UPDATE OR DELETE
 ON education_v30.learning_completion_evidence_review_requests
 FOR EACH ROW EXECUTE FUNCTION education_v30.ws3_guard_review_request();

ALTER TABLE education_v30.learning_completion_evidence_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.learning_completion_evidence_review_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON education_v30.learning_completion_evidence_review_requests FROM PUBLIC;
CREATE POLICY ws3_review_request_owner_only
 ON education_v30.learning_completion_evidence_review_requests
 FOR ALL TO neondb_owner USING(true) WITH CHECK(true);
-- Only authenticated and feature-gated server commands may transition
-- requests or insert an independently reviewed evidence binding.
COMMIT;
