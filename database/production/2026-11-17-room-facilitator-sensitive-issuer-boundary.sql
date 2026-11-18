-- CAN OS main: extending the staff reader to Room Facilitator MUST NOT
-- broaden independently approved issuer operations. Existing approvals are
-- still required, and only Site Admin/Registrar may use this sensitive path.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb'
 THEN RAISE EXCEPTION 'Not CAN OS Neon main'; END IF;
 IF to_regprocedure('education_v30.v301_can_staff_session_context(text)') IS NULL
 OR to_regprocedure('education_v30.v301_can_sensitive_capability(text,text)') IS NULL
 THEN RAISE EXCEPTION 'Required restricted staff functions missing'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION education_v30.v301_can_sensitive_capability(p_can_session_hash text, p_capability_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 SELECT p_capability_code='credential.issue' AND EXISTS (
   SELECT 1
   FROM education_v30.v301_can_staff_session_context(p_can_session_hash) staff
   JOIN public.access_sessions source_session
     ON source_session.id=staff.session_id
       AND source_session.secret_hash=p_can_session_hash
   JOIN education_v30.canonical_sensitive_capability_approvals approval
     ON approval.canonical_grant_id=staff.grant_id
       AND approval.requested_by_can_account_id=source_session.account_id
   WHERE staff.role_code IN ('site_admin','registrar')
     AND approval.capability_code=p_capability_code
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
$function$;

DO $verify$
DECLARE fn text;
BEGIN
 SELECT pg_get_functiondef('education_v30.v301_can_sensitive_capability(text,text)'::regprocedure) INTO fn;
 IF fn NOT LIKE '%staff.role_code IN (''site_admin'',''registrar'')%'
 OR NOT has_function_privilege('can_v30_canonical_auth_reader',
    'education_v30.v301_can_staff_session_context(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Sensitive capability role restriction not preserved'; END IF;
 IF education_v30.v301_can_sensitive_capability(repeat('0',64),'credential.issue')
 THEN RAISE EXCEPTION 'Unknown session gained issuer capability'; END IF;
END $verify$;
COMMIT;
