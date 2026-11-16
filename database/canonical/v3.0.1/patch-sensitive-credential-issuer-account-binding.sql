-- P0 hotfix for previously installed credential issuer approvals.
-- An approval must NOT transfer when a native Person/grant is subsequently
-- linked to a different CAN account. Additive and idempotent function update.
-- Use only after patch-sensitive-credential-issuer-approvals.sql.
BEGIN;
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
COMMENT ON FUNCTION education_v30.v301_can_sensitive_capability(text,text) IS
 'Approval is bound to current verified CAN account AND native grant; independent reviewer, expiry and revocation always rechecked.';
COMMIT;
