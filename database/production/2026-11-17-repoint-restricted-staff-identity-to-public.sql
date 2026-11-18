-- Neon main: restricted CAN staff session still verifies the independent
-- Person attestation and native role grant, but shares the ONE public Site
-- and Organization identity. No alias table, no extra login, no privilege grant.
-- No new grant, session or Person record is created by this migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not CAN OS Neon main'; END IF;
 IF to_regclass('public.sites') IS NULL
 OR to_regclass('public.organizations') IS NULL
 OR to_regclass('education_v30.canonical_accounts') IS NULL
 THEN RAISE EXCEPTION 'Required identity tables absent'; END IF;
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f'
   AND confrelid IN (to_regclass('education_v30.sites'),to_regclass('education_v30.organizations')))
 THEN RAISE EXCEPTION 'Legacy identity FKs have not been fully migrated'; END IF;
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
    JOIN public.sites school_site
      ON school_site.id = g.site_id
      AND school_site.organization_id = g.organization_id
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
      AND g.active = true
      AND g.role IN ('site_admin', 'registrar')
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
  SELECT native_account.id, source.can_session_id, native_grant.id,
    native_grant.person_id, native_grant.role_code,
    native_grant.organization_id, native_grant.site_id
  FROM source_session source
  JOIN public.access_account_canonical_principals person_link
    ON person_link.account_id = source.can_account_id
      AND person_link.revoked_at IS NULL
      AND person_link.verified_at IS NOT NULL
      AND person_link.verified_by_account_id <> source.can_account_id
  JOIN education_v30.canonical_account_grants native_grant
    ON native_grant.person_id = person_link.canonical_principal_id
      AND native_grant.site_id = source.can_site_id
      AND native_grant.role_code = source.can_role
      AND native_grant.active = true
      AND native_grant.revoked_at IS NULL
  JOIN education_v30.canonical_accounts native_account
    ON native_account.id = native_grant.account_id
      AND native_account.email_verified_at IS NOT NULL
      AND native_account.disabled_at IS NULL
  JOIN public.organizations native_org
    ON native_org.id = native_grant.organization_id
      AND native_org.id = source.can_organization_id
      AND native_org.lifecycle_status = 'active'
  JOIN public.sites native_site
    ON native_site.id = source.can_site_id
      AND native_site.lifecycle_status IN ('planning', 'active')
  WHERE EXISTS (
    SELECT 1 FROM education_v30.site_organization_roles operator_role
    WHERE operator_role.organization_id = native_grant.organization_id
      AND operator_role.site_id = native_grant.site_id
      AND operator_role.role_code IN ('operator', 'host')
      AND operator_role.valid_from <= clock_timestamp()
      AND (operator_role.valid_through IS NULL
        OR operator_role.valid_through > clock_timestamp())
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.access_account_canonical_principals other_link
    WHERE other_link.canonical_principal_id = person_link.canonical_principal_id
      AND other_link.account_id <> source.can_account_id
      AND other_link.revoked_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.access_account_canonical_principals other_link
    WHERE other_link.account_id = source.can_account_id
      AND other_link.canonical_principal_id <> person_link.canonical_principal_id
      AND other_link.revoked_at IS NULL
  );
$function$

DO $verify$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('education_v30.v301_can_staff_session_context(text)'::regprocedure) INTO definition;
 IF definition LIKE '%education_v30.sites%' OR definition LIKE '%education_v30.organizations%'
   OR definition NOT LIKE '%native_org.id = source.can_organization_id%'
   OR definition NOT LIKE '%native_site.lifecycle_status%'
 THEN RAISE EXCEPTION 'Restricted staff read still uses duplicate identity'; END IF;
 IF (SELECT count(*) FROM education_v30.v301_can_staff_session_context(repeat('0',64)))<>0
 THEN RAISE EXCEPTION 'Unrecognized session unexpectedly authorized'; END IF;
 IF NOT has_function_privilege('can_v30_canonical_auth_reader',
    'education_v30.v301_can_staff_session_context(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Restricted reader execution privilege changed'; END IF;
END $verify$;
COMMIT;
