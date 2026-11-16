-- P0: independent, renewable authorization to issue noncredit credentials.
-- Additive. No issuer privilege, account or production grant is created here.
-- The CAN account remains the sole interactive staff sign-in.
BEGIN;

CREATE TABLE IF NOT EXISTS education_v30.canonical_sensitive_capability_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 canonical_grant_id uuid NOT NULL
   REFERENCES education_v30.canonical_account_grants(id) ON DELETE RESTRICT,
 capability_code text NOT NULL CHECK (capability_code = 'credential.issue'),
 requested_by_can_account_id uuid NOT NULL
   REFERENCES public.access_accounts(id) ON DELETE RESTRICT,
 request_evidence_reference text NOT NULL
   CHECK (length(btrim(request_evidence_reference)) BETWEEN 25 AND 1200),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'pending'
   CHECK (status IN ('pending','approved','rejected','revoked')),
 reviewed_by_can_account_id uuid
   REFERENCES public.access_accounts(id) ON DELETE RESTRICT,
 review_evidence_reference text,
 reviewed_at timestamptz,
 approved_until timestamptz,
 revoked_at timestamptz,
 revoked_by_can_account_id uuid
   REFERENCES public.access_accounts(id) ON DELETE RESTRICT,
 revoked_reason text,
 CONSTRAINT sensitive_approval_review_independence CHECK (
   reviewed_by_can_account_id IS NULL
   OR requested_by_can_account_id <> reviewed_by_can_account_id
 ),
 CONSTRAINT sensitive_approval_state CHECK (
   (status='pending' AND reviewed_by_can_account_id IS NULL
      AND reviewed_at IS NULL AND review_evidence_reference IS NULL
      AND approved_until IS NULL AND revoked_at IS NULL
      AND revoked_by_can_account_id IS NULL)
   OR
   (status IN ('approved','rejected','revoked')
      AND reviewed_by_can_account_id IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND length(btrim(review_evidence_reference)) >= 25)
 ),
 CONSTRAINT sensitive_approval_expiry CHECK (
   status<>'approved' OR
      (approved_until IS NOT NULL AND approved_until > reviewed_at)
 ),
 CONSTRAINT sensitive_approval_revocation CHECK (
   (status='revoked' AND revoked_at IS NOT NULL
      AND revoked_by_can_account_id IS NOT NULL
      AND length(btrim(revoked_reason)) >= 25)
   OR (status<>'revoked' AND revoked_at IS NULL
      AND revoked_by_can_account_id IS NULL AND revoked_reason IS NULL)
 )
);

-- One active/pending application per canonical staff grant.
-- Rejections and revocations retain their history and allow a fresh request.
CREATE UNIQUE INDEX IF NOT EXISTS sensitive_approvals_open_grant_uq
 ON education_v30.canonical_sensitive_capability_approvals
 (canonical_grant_id,capability_code)
 WHERE status IN ('pending','approved');

CREATE INDEX IF NOT EXISTS sensitive_approvals_status_idx
 ON education_v30.canonical_sensitive_capability_approvals
 (status,requested_at);

ALTER TABLE education_v30.canonical_sensitive_capability_approvals
 ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.canonical_sensitive_capability_approvals
 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON education_v30.canonical_sensitive_capability_approvals FROM PUBLIC;

-- The general user roles get no direct read/write. Application endpoints
-- only query under a trusted owner after account/role validation, and a
-- restricted auth reader gets a narrow SECURITY DEFINER projection below.
DO $policy$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_policies
   WHERE schemaname='education_v30'
     AND tablename='canonical_sensitive_capability_approvals'
     AND policyname='sensitive_approvals_trusted_owner'
 ) THEN
   EXECUTE format(
     'CREATE POLICY sensitive_approvals_trusted_owner
      ON education_v30.canonical_sensitive_capability_approvals
      FOR ALL TO %I USING (true) WITH CHECK (true)',
      current_user);
 END IF;
END $policy$;

-- An approval belongs to both the exact native staff grant AND the
-- verified CAN account that requested it. Rebinding the canonical Person to
-- a different CAN account never transfers issuer authority.
-- No browser-selected identity, Site, org or role can authorize issuance.
-- This function accepts only the hashed existing CAN session plus a
-- hardcoded capability; it performs the full native staff session check.
CREATE OR REPLACE FUNCTION education_v30.v301_can_sensitive_capability(
 p_can_session_hash text, p_capability_code text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $capability$
 SELECT p_capability_code='credential.issue' AND EXISTS (
   SELECT 1
   FROM education_v30.v301_can_staff_session_context(p_can_session_hash) staff
   JOIN public.access_sessions source_session
     ON source_session.id=staff.session_id
       AND source_session.secret_hash=p_can_session_hash
   JOIN education_v30.canonical_sensitive_capability_approvals approval
     ON approval.canonical_grant_id=staff.grant_id
       AND approval.requested_by_can_account_id=source_session.account_id
   WHERE approval.capability_code=p_capability_code
     AND approval.status='approved'
     AND approval.reviewed_at IS NOT NULL
     AND approval.reviewed_by_can_account_id <>
         approval.requested_by_can_account_id
     AND approval.approved_until > clock_timestamp()
     AND approval.revoked_at IS NULL
     AND approval.requested_at <= approval.reviewed_at
     AND NOT EXISTS (
       SELECT 1 FROM public.access_account_canonical_principals reviewer_link
       WHERE reviewer_link.account_id=approval.reviewed_by_can_account_id
         AND reviewer_link.canonical_principal_id=staff.person_id
         AND reviewer_link.revoked_at IS NULL
     )
 );
$capability$;

REVOKE ALL ON FUNCTION
 education_v30.v301_can_sensitive_capability(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 education_v30.v301_can_sensitive_capability(text,text)
 TO can_v30_canonical_auth_reader;

COMMENT ON TABLE education_v30.canonical_sensitive_capability_approvals IS
 'Independent, expiring native staff grant authorizations. No role-derived credential issuance and no second login.';
COMMENT ON FUNCTION education_v30.v301_can_sensitive_capability(text,text) IS
 'Session-bound credential issuer authority, guarded by independent approval, expiry, original CAN session, reviewed identity and native exact-Site role.';

COMMIT;
