-- WS2 native Class enrollment intent and governance.
-- Additive source-only proposal. Apply to isolated test01 only after reviewed
-- migration ordering, restricted role/grant plan and negative RLS acceptance.
-- Never run automatically against production.
--
-- This is NOT a second Enrollment ledger. An invitation/approval/transfer/
-- repeat decision is an authorization intent; class_enrollments remains the
-- sole participant, Course Attempt and seat authority.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
DO $preflight$
BEGIN
 IF to_regclass('education_v30.classes') IS NULL OR
    to_regclass('education_v30.class_enrollments') IS NULL OR
    to_regclass('education_v30.class_offering_versions') IS NULL OR
    to_regclass('education_v30.persons') IS NULL THEN
  RAISE EXCEPTION 'WS2 requires verified canonical Class and Person schema';
 END IF;
END $preflight$;

CREATE TABLE IF NOT EXISTS education_v30.class_enrollment_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 class_offering_version_id uuid NOT NULL
   REFERENCES education_v30.class_offering_versions(id),
 operating_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 site_id uuid NOT NULL REFERENCES education_v30.sites(id),
 learner_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 invited_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 request_id uuid NOT NULL,
 credit_mode text NOT NULL CHECK(credit_mode IN ('for_credit','audit','not_applicable')),
 state text NOT NULL DEFAULT 'pending'
   CHECK(state IN ('pending','accepted','declined','revoked','expired')),
 invited_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 responded_at timestamptz,
 accepted_enrollment_id uuid REFERENCES education_v30.class_enrollments(id),
 CONSTRAINT ws2_invite_expiry_valid CHECK(expires_at>invited_at AND
   expires_at<=invited_at+interval '48 hours'),
 CONSTRAINT ws2_invite_terminal_contract CHECK(
  (state='accepted' AND accepted_enrollment_id IS NOT NULL AND responded_at IS NOT NULL)
  OR (state IN ('declined','revoked','expired') AND
    accepted_enrollment_id IS NULL AND responded_at IS NOT NULL)
  OR (state='pending' AND accepted_enrollment_id IS NULL AND responded_at IS NULL)),
 CONSTRAINT ws2_invite_request_idempotency UNIQUE(class_id,invited_by_person_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ws2_invitation_one_pending_per_person
 ON education_v30.class_enrollment_invitations(class_id,learner_person_id)
 WHERE state='pending';
CREATE INDEX IF NOT EXISTS ws2_invitation_person_queue
 ON education_v30.class_enrollment_invitations(learner_person_id,state,expires_at);
CREATE INDEX IF NOT EXISTS ws2_invitation_operator_queue
 ON education_v30.class_enrollment_invitations(operating_organization_id,site_id,state,expires_at);

CREATE TABLE IF NOT EXISTS education_v30.class_enrollment_approval_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 class_offering_version_id uuid NOT NULL
   REFERENCES education_v30.class_offering_versions(id),
 operating_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 site_id uuid NOT NULL REFERENCES education_v30.sites(id),
 learner_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 applicant_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 -- Null unless an independently verified school/guardian relationship is
 -- bound and reviewed. A typed UUID alone is NEVER proof of guardianship.
 guardian_person_id uuid REFERENCES education_v30.persons(id),
 guardian_authority_evidence_version_id uuid
   REFERENCES education_v30.evidence_document_versions(id),
 eligibility_evidence_version_id uuid
   REFERENCES education_v30.evidence_document_versions(id),
 request_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'pending'
   CHECK(state IN ('pending','approved','rejected','withdrawn','expired')),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 reviewed_by_person_id uuid REFERENCES education_v30.persons(id),
 reviewed_at timestamptz,
 decision_reason text,
 accepted_enrollment_id uuid REFERENCES education_v30.class_enrollments(id),
 CONSTRAINT ws2_approval_valid_window CHECK(expires_at>requested_at),
 CONSTRAINT ws2_approval_independent_review CHECK(
  reviewed_by_person_id IS NULL OR
  (reviewed_by_person_id<>learner_person_id AND
   reviewed_by_person_id<>applicant_person_id AND
   (guardian_person_id IS NULL OR reviewed_by_person_id<>guardian_person_id))),
 CONSTRAINT ws2_approval_terminal_contract CHECK(
  (state='pending' AND reviewed_at IS NULL AND
   reviewed_by_person_id IS NULL AND accepted_enrollment_id IS NULL)
  OR (state='approved' AND reviewed_at IS NOT NULL AND
   reviewed_by_person_id IS NOT NULL AND accepted_enrollment_id IS NOT NULL AND
   eligibility_evidence_version_id IS NOT NULL)
  OR (state IN ('rejected','withdrawn','expired') AND
    reviewed_at IS NOT NULL AND accepted_enrollment_id IS NULL)),
 CONSTRAINT ws2_approval_request_idempotency UNIQUE(class_id,applicant_person_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ws2_approval_one_pending_per_learner
 ON education_v30.class_enrollment_approval_requests(class_id,learner_person_id)
 WHERE state='pending';
CREATE INDEX IF NOT EXISTS ws2_approval_operator_queue
 ON education_v30.class_enrollment_approval_requests(operating_organization_id,site_id,state,requested_at);

CREATE TABLE IF NOT EXISTS education_v30.class_enrollment_transfer_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_enrollment_id uuid NOT NULL REFERENCES education_v30.class_enrollments(id),
 target_class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 target_offering_version_id uuid NOT NULL
   REFERENCES education_v30.class_offering_versions(id),
 learner_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 requested_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 request_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'pending'
   CHECK(state IN ('pending','approved','rejected','cancelled','expired')),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 approved_by_person_id uuid REFERENCES education_v30.persons(id),
 decided_at timestamptz,
 updated_consent_version text,
 updated_consent_sha256 text,
 source_closed_at timestamptz,
 destination_enrollment_id uuid REFERENCES education_v30.class_enrollments(id),
 CONSTRAINT ws2_transfer_window CHECK(expires_at>requested_at),
 CONSTRAINT ws2_transfer_decision_state CHECK(
  (state='pending' AND decided_at IS NULL AND
   destination_enrollment_id IS NULL AND source_closed_at IS NULL)
  OR (state='approved' AND approved_by_person_id IS NOT NULL AND
    decided_at IS NOT NULL AND source_closed_at IS NOT NULL AND
    destination_enrollment_id IS NOT NULL AND
    updated_consent_sha256 IS NOT NULL)
  OR (state IN ('rejected','cancelled','expired') AND decided_at IS NOT NULL
    AND destination_enrollment_id IS NULL AND source_closed_at IS NULL)),
 CONSTRAINT ws2_transfer_request_idempotency UNIQUE(source_enrollment_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ws2_transfer_one_pending_per_enrollment
 ON education_v30.class_enrollment_transfer_requests(source_enrollment_id)
 WHERE state='pending';
CREATE INDEX IF NOT EXISTS ws2_transfer_destination_idx
 ON education_v30.class_enrollment_transfer_requests(target_class_id,state,requested_at);

CREATE TABLE IF NOT EXISTS education_v30.class_enrollment_repeat_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 learner_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 prior_enrollment_id uuid NOT NULL REFERENCES education_v30.class_enrollments(id),
 completion_outcome_id uuid NOT NULL REFERENCES education_v30.class_outcomes(id),
 evidence_version_id uuid NOT NULL REFERENCES education_v30.evidence_document_versions(id),
 approved_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_by_enrollment_id uuid UNIQUE REFERENCES education_v30.class_enrollments(id),
 CONSTRAINT ws2_repeat_independent CHECK(approved_by_person_id<>learner_person_id),
 CONSTRAINT ws2_repeat_expiry CHECK(expires_at>approved_at),
 CONSTRAINT ws2_repeat_exact_approval UNIQUE(class_id,learner_person_id,prior_enrollment_id,completion_outcome_id)
);

-- Fail closed pending purpose-restricted API/role grants. Do not grant public
-- or broad application DML on authorization intent, including for adult users.
DO $security$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY[
  'class_enrollment_invitations','class_enrollment_approval_requests',
  'class_enrollment_transfer_requests','class_enrollment_repeat_authorizations'
 ] LOOP
  EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('DROP POLICY IF EXISTS ws2_intent_owner_only ON education_v30.%I',relation);
  EXECUTE format('CREATE POLICY ws2_intent_owner_only ON education_v30.%I FOR ALL TO neondb_owner USING (true) WITH CHECK (true)',relation);
  EXECUTE format('REVOKE ALL ON education_v30.%I FROM PUBLIC',relation);
 END LOOP;
END $security$;
COMMIT;
