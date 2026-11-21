-- CAN OS V6.1 | General CAN staff authorization plus privileged demo switch.
-- Ordinary and synthetic schools share the SAME session/grant/Person/Site policy.
-- Only the fixed Demo Admin's authenticated cross-account grant selection is special.
-- No Riley IDs, synthetic flags, test-only authorization or parallel staff sessions.
-- Migration replaces only the canonical auth-reader function (same signature).
-- Use the existing restricted reader database role; never grant table SELECT.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb'
 THEN RAISE EXCEPTION 'CAN OS Neon main project/branch mismatch'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.access_accounts a
   JOIN public.account_person_grants g
     ON g.account_id=a.id AND g.person_id=a.person_id
   WHERE a.id='f7100000-0000-4000-8000-000000000002'
     AND a.email_normalized='admin.demo@valorschool.demo'
     AND a.email_verified_at IS NOT NULL AND NOT a.disabled
     AND g.id='f7100000-0000-4000-8000-000000000003'
     AND g.role='site_admin' AND g.active
     AND g.organization_id='f1000000-0000-4000-8000-000000000002'
     AND g.site_id='f1000000-0000-4000-8000-000000000003'
 ) THEN RAISE EXCEPTION 'Approved Demo Admin anchor changed'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION education_v30.v301_can_staff_session_context(p_can_session_hash text)
 RETURNS TABLE(account_id uuid,session_id uuid,grant_id uuid,person_id uuid,
               role_code text,organization_id uuid,site_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 WITH effective AS MATERIALIZED (
  SELECT
   target_account.id AS effective_account_id,
   s.id AS session_id,
   g.id AS grant_id,
   g.person_id AS person_id,
   g.role AS role_code,
   g.organization_id AS organization_id,
   g.site_id AS site_id
  FROM public.access_sessions s
  JOIN public.access_accounts session_owner
   ON session_owner.id=s.account_id
  JOIN public.account_person_grants g
   ON g.id=s.active_grant_id
  JOIN public.access_accounts target_account
   ON target_account.id=g.account_id
  JOIN public.people target_person
   ON target_person.id=g.person_id
  JOIN public.organizations org
   ON org.id=g.organization_id AND org.lifecycle_status='active'
  JOIN public.sites site
   ON site.id=g.site_id AND site.organization_id=g.organization_id
      AND site.lifecycle_status IN ('planning','active')
  WHERE s.secret_hash=p_can_session_hash
   AND length(p_can_session_hash)=64
   AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp()
   AND s.updated_at>clock_timestamp()-interval '30 minutes'
   AND (NOT s.shared_device OR s.last_activity_at>clock_timestamp()-interval '5 minutes')
   AND session_owner.disabled=false
   AND session_owner.email_verified_at IS NOT NULL
   AND target_account.disabled=false
   AND target_account.email_verified_at IS NOT NULL
   AND target_account.person_id=g.person_id
   AND target_person.active=true
   AND g.active=true
   AND g.role IN ('site_admin','registrar','room_facilitator')
   AND g.organization_id IS NOT NULL
   AND g.site_id IS NOT NULL
   AND NOT EXISTS(
    SELECT 1 FROM public.account_person_grants conflicting
    WHERE conflicting.account_id=target_account.id
      AND conflicting.active=true AND conflicting.person_id<>g.person_id
   )
   AND (
    -- Ordinary login, with identical behavior for real and synthetic users.
    g.account_id=session_owner.id
    OR
    -- Only the authenticated Demo Admin may select a different existing grant.
    -- The selected user still needs their own current, verified, active identity.
    (
      session_owner.id='f7100000-0000-4000-8000-000000000002'::uuid
      AND session_owner.email_normalized='admin.demo@valorschool.demo'
      AND EXISTS (
        SELECT 1 FROM public.account_person_grants admin_grant
        WHERE admin_grant.id='f7100000-0000-4000-8000-000000000003'::uuid
          AND admin_grant.account_id=session_owner.id
          AND admin_grant.person_id=session_owner.person_id
          AND admin_grant.role='site_admin'
          AND admin_grant.active=true
          AND admin_grant.organization_id=g.organization_id
          AND admin_grant.site_id=g.site_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.account_person_grants invalid_admin_grant
        WHERE invalid_admin_grant.account_id=session_owner.id
          AND invalid_admin_grant.active=true
          AND invalid_admin_grant.person_id<>session_owner.person_id
      )
    )
   )
 )
 SELECT e.effective_account_id,e.session_id,e.grant_id,e.person_id,
        e.role_code,e.organization_id,e.site_id
 FROM effective e;
$function$;

DO $verify$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef('education_v30.v301_can_staff_session_context(text)'::regprocedure)
 INTO body;
 IF body NOT LIKE '%g.account_id=session_owner.id%'
  OR body NOT LIKE '%target_account.person_id=g.person_id%'
  OR body NOT LIKE '%target_account.email_verified_at IS NOT NULL%'
  OR body NOT LIKE '%admin_grant.account_id=session_owner.id%'
  OR body LIKE '%riley.teacher@valorschool.demo%'
  OR body LIKE '%person.metadata%'
 THEN RAISE EXCEPTION 'Expected ordinary authorization and isolated admin switch'; END IF;
 IF NOT has_function_privilege('can_v30_canonical_auth_reader',
   'education_v30.v301_can_staff_session_context(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Restricted CAN reader execution privilege missing'; END IF;
 IF (SELECT COUNT(*) FROM education_v30.v301_can_staff_session_context(repeat('0',64)))<>0
 THEN RAISE EXCEPTION 'Unknown digest unexpectedly authenticated'; END IF;
END $verify$;
COMMIT;
