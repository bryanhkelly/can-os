-- Release 11252026: credential parity for the existing restricted CAN staff reader.
-- No mailbox verification timestamps are fabricated. No data or privileges are granted.
-- Apply only with the coordinated application release, after acceptance testing.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
 OR current_database() IS DISTINCT FROM 'neondb'
 THEN RAISE EXCEPTION 'CAN OS Neon main project/branch mismatch'; END IF;
 IF to_regprocedure('education_v30.v301_can_staff_session_context(text)') IS NULL
 THEN RAISE EXCEPTION 'Expected restricted CAN staff reader missing'; END IF;
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
   AND s.delegated_grant_id IS NULL
   AND s.delegated_mode IS NULL
   AND s.delegated_until IS NULL
   AND s.delegated_reason IS NULL
   AND s.expires_at>clock_timestamp()
   AND s.updated_at>clock_timestamp()-interval '30 minutes'
   AND (NOT s.shared_device OR s.last_activity_at>clock_timestamp()-interval '5 minutes')
   AND session_owner.disabled=false
   AND ((session_owner.email_verified_at IS NOT NULL AND session_owner.email_normalized NOT LIKE '%.demo')
     OR (session_owner.email_normalized ~ '^[^@[:space:]]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?[.]demo
   AND target_account.disabled=false
   AND ((target_account.email_verified_at IS NOT NULL AND target_account.email_normalized NOT LIKE '%.demo')
     OR (target_account.email_normalized ~ '^[^@[:space:]]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?[.]demo
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

       AND (
        (split_part(session_owner.email_normalized,'@',2)='valorschool.demo'
         AND g.organization_id='f1000000-0000-4000-8000-000000000002'::uuid
         AND g.site_id='f1000000-0000-4000-8000-000000000003'::uuid)
        OR EXISTS (SELECT 1 FROM public.demo_school_tenants credential_tenant
          WHERE credential_tenant.enabled
           AND credential_tenant.domain=split_part(session_owner.email_normalized,'@',2)
           AND credential_tenant.organization_id=g.organization_id
           AND credential_tenant.site_id=g.site_id)
       )))
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

       AND (
        (split_part(target_account.email_normalized,'@',2)='valorschool.demo'
         AND g.organization_id='f1000000-0000-4000-8000-000000000002'::uuid
         AND g.site_id='f1000000-0000-4000-8000-000000000003'::uuid)
        OR EXISTS (SELECT 1 FROM public.demo_school_tenants credential_tenant
          WHERE credential_tenant.enabled
           AND credential_tenant.domain=split_part(target_account.email_normalized,'@',2)
           AND credential_tenant.organization_id=g.organization_id
           AND credential_tenant.site_id=g.site_id)
       )))
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

       AND (
        (split_part(session_owner.email_normalized,'@',2)='valorschool.demo'
         AND g.organization_id='f1000000-0000-4000-8000-000000000002'::uuid
         AND g.site_id='f1000000-0000-4000-8000-000000000003'::uuid)
        OR EXISTS (SELECT 1 FROM public.demo_school_tenants credential_tenant
          WHERE credential_tenant.enabled
           AND credential_tenant.domain=split_part(session_owner.email_normalized,'@',2)
           AND credential_tenant.organization_id=g.organization_id
           AND credential_tenant.site_id=g.site_id)
       )))
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
BEGIN
 IF NOT has_function_privilege('can_v30_canonical_auth_reader',
   'education_v30.v301_can_staff_session_context(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Restricted reader execution privilege missing'; END IF;
 IF (SELECT COUNT(*) FROM education_v30.v301_can_staff_session_context(repeat('0',64)))<>0
 THEN RAISE EXCEPTION 'Unknown digest unexpectedly authenticated'; END IF;
END $verify$;
COMMIT;
