-- Narrow credential issuer-approval mutation role.
-- Apply AFTER patch-sensitive-credential-issuer-account-binding.sql.
-- This does not enable award issuance, create issuer approvals, or modify roles.
BEGIN;
DO $role$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles
   WHERE rolname='can_v30_sensitive_approval_writer') THEN
   CREATE ROLE can_v30_sensitive_approval_writer NOLOGIN NOINHERIT NOBYPASSRLS;
 END IF;
END $role$;

GRANT USAGE ON SCHEMA education_v30 TO can_v30_sensitive_approval_writer;
GRANT SELECT,INSERT,UPDATE
 ON education_v30.canonical_sensitive_capability_approvals
 TO can_v30_sensitive_approval_writer;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER
 ON education_v30.canonical_sensitive_capability_approvals
 FROM can_v30_sensitive_approval_writer;

-- The table owner may SET this role for controlled migrations/tests.
-- A separate runtime login requires an explicit reviewed membership grant.
DO $membership$
DECLARE owner_name text;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO owner_name
 FROM pg_class
 WHERE oid='education_v30.canonical_sensitive_capability_approvals'::regclass;
 EXECUTE format('GRANT can_v30_sensitive_approval_writer TO %I',owner_name);
END $membership$;

DO $policies$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
  AND tablename='canonical_sensitive_capability_approvals'
  AND policyname='sensitive_approval_writer_read') THEN
  CREATE POLICY sensitive_approval_writer_read
   ON education_v30.canonical_sensitive_capability_approvals
   FOR SELECT TO can_v30_sensitive_approval_writer USING(true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
  AND tablename='canonical_sensitive_capability_approvals'
  AND policyname='sensitive_approval_writer_request') THEN
  CREATE POLICY sensitive_approval_writer_request
   ON education_v30.canonical_sensitive_capability_approvals
   FOR INSERT TO can_v30_sensitive_approval_writer
   WITH CHECK (
      current_setting('can.issuer_approval_action',true)='request'
      AND status='pending'
      AND capability_code='credential.issue'
      AND requested_by_can_account_id::text=
          current_setting('can.issuer_approval_actor',true)
      AND reviewed_by_can_account_id IS NULL
      AND reviewed_at IS NULL
      AND approved_until IS NULL
      AND revoked_at IS NULL
   );
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
  AND tablename='canonical_sensitive_capability_approvals'
  AND policyname='sensitive_approval_writer_decision') THEN
  CREATE POLICY sensitive_approval_writer_decision
   ON education_v30.canonical_sensitive_capability_approvals
   FOR UPDATE TO can_v30_sensitive_approval_writer
   USING (status IN ('pending','approved'))
   WITH CHECK (
      (
        current_setting('can.issuer_approval_action',true)='review'
        AND status IN ('approved','rejected')
        AND reviewed_by_can_account_id::text=
            current_setting('can.issuer_approval_actor',true)
        AND reviewed_by_can_account_id<>requested_by_can_account_id
        AND reviewed_at IS NOT NULL
        AND length(btrim(review_evidence_reference))>=25
        AND (status<>'approved' OR approved_until>clock_timestamp())
      ) OR (
        current_setting('can.issuer_approval_action',true)='revoke'
        AND status='revoked'
        AND revoked_by_can_account_id::text=
            current_setting('can.issuer_approval_actor',true)
        AND revoked_by_can_account_id<>requested_by_can_account_id
        AND revoked_at IS NOT NULL
        AND length(btrim(revoked_reason))>=25
      )
   );
 END IF;
END $policies$;
COMMIT;
