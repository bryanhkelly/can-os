-- CAN OS main only: transition sensitive credential issuer authority from an
-- EMPTY native grant table to the real, uniquely selected CAN account/Person grant.
-- One atomic cutover. Do not merge/match accounts by email or issue approvals.
-- Deploy with the matching application changes in the same release.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $preflight$
DECLARE count_rows bigint;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
     OR current_database()<>'neondb' OR current_user<>'neondb_owner'
  THEN RAISE EXCEPTION 'Only reviewed CAN OS production main is supported'; END IF;
  IF to_regclass('public.canonical_sensitive_capability_approvals') IS NULL
    OR to_regclass('public.account_person_grants') IS NULL
    OR to_regclass('education_v30.canonical_account_grants') IS NULL
  THEN RAISE EXCEPTION 'Approval or grant table missing'; END IF;
  SELECT count(*) INTO count_rows FROM public.canonical_sensitive_capability_approvals;
  IF count_rows<>0 THEN
    RAISE EXCEPTION 'Existing issuer decisions require record-level migration';
  END IF;
  SELECT count(*) INTO count_rows FROM education_v30.canonical_account_grants;
  IF count_rows<>0 THEN
    RAISE EXCEPTION 'Native grants are non-empty; do not rekey approvals automatically';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.canonical_sensitive_capability_approvals'::regclass
      AND conname='canonical_sensitive_capability_approval_canonical_grant_id_fkey'
      AND pg_get_constraintdef(oid) =
      'FOREIGN KEY (canonical_grant_id) REFERENCES education_v30.canonical_account_grants(id) ON DELETE RESTRICT'
  ) THEN RAISE EXCEPTION 'Legacy approval FK drifted'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='canonical_sensitive_capability_approvals'
      AND column_name='canonical_grant_id'
  ) THEN RAISE EXCEPTION 'Expected old column missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid='public.canonical_sensitive_capability_approvals'::regclass
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'Sensitive approval forced RLS not enabled'; END IF;
  IF to_regprocedure('education_v30.v301_can_staff_session_context(text)') IS NULL
     OR to_regprocedure('education_v30.v301_can_sensitive_capability(text,text)') IS NULL
  THEN RAISE EXCEPTION 'Restricted credential reader missing'; END IF;
END $preflight$;

ALTER TABLE public.canonical_sensitive_capability_approvals
 RENAME COLUMN canonical_grant_id TO account_person_grant_id;
ALTER TABLE public.canonical_sensitive_capability_approvals
 ADD CONSTRAINT sensitive_approvals_account_person_grant_id_fkey
 FOREIGN KEY (account_person_grant_id) REFERENCES public.account_person_grants(id)
 ON DELETE RESTRICT;
ALTER TABLE public.canonical_sensitive_capability_approvals
 DROP CONSTRAINT canonical_sensitive_capability_approval_canonical_grant_id_fkey;

-- The immutable CAN identity and selected grant originate from the restricted
-- CAN staff reader, not an unsigned request, a native cookie, or an email link.
-- Reviewer independence checks the authoritative Person anchor, not the
-- already-retired Person correspondence table.
CREATE OR REPLACE FUNCTION education_v30.v301_can_sensitive_capability(
  p_can_session_hash text,p_capability_code text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $fn$
 SELECT p_capability_code='credential.issue' AND EXISTS (
   SELECT 1
   FROM education_v30.v301_can_staff_session_context(p_can_session_hash) staff
   JOIN public.access_sessions source_session
     ON source_session.id=staff.session_id
       AND source_session.secret_hash=p_can_session_hash
   JOIN public.canonical_sensitive_capability_approvals approval
     ON approval.account_person_grant_id=staff.grant_id
       AND approval.requested_by_can_account_id=source_session.account_id
   JOIN public.access_accounts reviewer
     ON reviewer.id=approval.reviewed_by_can_account_id
   WHERE staff.role_code IN ('site_admin','registrar')
     AND approval.capability_code=p_capability_code
     AND approval.status='approved'
     AND approval.reviewed_at IS NOT NULL
     AND approval.reviewed_by_can_account_id <>
         approval.requested_by_can_account_id
     AND reviewer.person_id IS NOT NULL
     AND reviewer.person_id <> staff.person_id
     AND approval.approved_until > clock_timestamp()
     AND approval.revoked_at IS NULL
     AND approval.requested_at <= approval.reviewed_at
 );
$fn$;

DO $verify$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef('education_v30.v301_can_sensitive_capability(text,text)'::regprocedure)
    INTO body;
  IF body NOT LIKE '%approval.account_person_grant_id=staff.grant_id%'
    OR body NOT LIKE '%reviewer.person_id <> staff.person_id%'
    OR body ILIKE '%access_account_canonical_principals%'
    OR NOT has_function_privilege('can_v30_canonical_auth_reader',
      'education_v30.v301_can_sensitive_capability(text,text)','EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_constraint
      WHERE conrelid='public.canonical_sensitive_capability_approvals'::regclass
      AND confrelid='education_v30.canonical_account_grants'::regclass)
    OR NOT EXISTS(SELECT 1 FROM pg_constraint
      WHERE conrelid='public.canonical_sensitive_capability_approvals'::regclass
      AND confrelid='public.account_person_grants'::regclass)
  THEN RAISE EXCEPTION 'Shared-grant issuer cutover incomplete'; END IF;
  IF education_v30.v301_can_sensitive_capability(repeat('0',64),'credential.issue')
  THEN RAISE EXCEPTION 'Unknown session authorized as issuer'; END IF;
END $verify$;
COMMIT;
