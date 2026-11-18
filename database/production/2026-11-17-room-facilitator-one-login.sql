-- CAN OS Neon main: ONE CAN account and Person for Site Admin, Registrar and Room Facilitator.
-- Extend the existing read-only restricted staff projection in place. Exact session,
-- verified current CAN grant, immutable Person ID, owning Site and Organization
-- are revalidated. The native staff grant and Person correspondence tables are
-- NOT consulted or recreated; independent high-risk approvals are separate.
-- This does not issue any grants, enroll learners or assign staff to a Site.
-- Room facilitators receive only learning.room.facilitate through the existing
-- capability projection; physical supervision and Class staff grants remain separate.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' THEN RAISE EXCEPTION 'Not CAN OS Neon main'; END IF;
 IF EXISTS(SELECT 1 FROM education_v30.canonical_account_grants)
 OR EXISTS(SELECT 1 FROM public.access_account_canonical_principals)
 THEN RAISE EXCEPTION 'Existing native staff correspondences need review'; END IF;
 IF (SELECT count(*)::int FROM public.access_accounts WHERE person_id IS NULL)<>0
 THEN RAISE EXCEPTION 'CAN account Person ownership is incomplete'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
 WHERE oid='public.people'::regclass)
 THEN RAISE EXCEPTION 'Authoritative Person security not enforced'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION education_v30.v301_can_staff_session_context(p_can_session_hash text)
 RETURNS TABLE(account_id uuid, session_id uuid, grant_id uuid, person_id uuid, role_code text, organization_id uuid, site_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  WITH source_session AS MATERIALIZED (
    SELECT
      a.id AS can_account_id,
      s.id AS can_session_id,
      g.id AS can_grant_id,
      g.person_id AS can_person_id,
      g.organization_id AS can_organization_id,
      g.site_id AS can_site_id,
      g.role AS can_role
    FROM public.access_sessions s
    JOIN public.access_accounts a
      ON a.id = s.account_id
    JOIN public.account_person_grants g
      ON g.id = s.active_grant_id AND g.account_id = a.id
    JOIN public.people person
      ON person.id = g.person_id
    JOIN public.organizations owning_org
      ON owning_org.id = g.organization_id
      AND owning_org.lifecycle_status = 'active'
    JOIN public.sites school_site
      ON school_site.id = g.site_id
      AND school_site.organization_id = g.organization_id
      AND school_site.lifecycle_status IN ('planning', 'active')
    WHERE s.secret_hash = p_can_session_hash
      AND length(p_can_session_hash) = 64
      AND s.revoked_at IS NULL
      AND s.expires_at > clock_timestamp()
      AND s.updated_at > clock_timestamp() - interval '30 minutes'
      AND (NOT s.shared_device OR
        s.last_activity_at > clock_timestamp() - interval '5 minutes')
      AND a.disabled = false
      AND a.email_verified_at IS NOT NULL
      AND lower(a.email_normalized) NOT LIKE '%.demo'
      AND person.active = true
      AND a.person_id = g.person_id
      AND g.active = true
      AND g.role IN ('site_admin', 'registrar', 'room_facilitator')
      AND g.site_id IS NOT NULL
      AND g.organization_id IS NOT NULL
      -- A real shared account with different Persons cannot select a
      -- second Person simply by switching the active role.
      AND NOT EXISTS (
        SELECT 1 FROM public.account_person_grants other_grant
        WHERE other_grant.account_id = a.id
          AND other_grant.active = true
          AND other_grant.person_id <> g.person_id
      )
  )
  SELECT source.can_account_id, source.can_session_id, source.can_grant_id,
    source.can_person_id, source.can_role,
    source.can_organization_id, source.can_site_id
  FROM source_session source;
$function$;

DO $verify$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('education_v30.v301_can_staff_session_context(text)'::regprocedure)
 INTO definition;
 IF definition ILIKE '%access_account_canonical_principals%'
 OR definition ILIKE '%canonical_account_grants%'
 OR definition ILIKE '%canonical_accounts native_account%'
 OR definition ILIKE '%site_organization_roles%'
 OR definition NOT LIKE '%source.can_grant_id%'
 OR definition NOT LIKE '%a.person_id = g.person_id%'
 OR definition NOT LIKE '%g.role IN (''site_admin'', ''registrar'', ''room_facilitator'')%'
 OR definition NOT LIKE '%lower(a.email_normalized) NOT LIKE ''%.demo''%'
 THEN RAISE EXCEPTION 'Native staff identity dependency remains'; END IF;
 IF NOT has_function_privilege('can_v30_canonical_auth_reader',
 'education_v30.v301_can_staff_session_context(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Restricted reader execution permission changed'; END IF;
 IF (SELECT count(*) FROM education_v30.v301_can_staff_session_context(repeat('0',64)))<>0
 THEN RAISE EXCEPTION 'Unknown CAN session unexpectedly authorized'; END IF;
END $verify$;
COMMIT;
