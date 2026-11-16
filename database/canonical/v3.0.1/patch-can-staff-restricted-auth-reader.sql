-- Security boundary for one CAN login, canonical staff authorization.
-- Requires patch-can-staff-single-login.sql, approved Site identity link
-- tables and native canonical auth reader role. No user or grant creation.
-- Review and apply to an isolated test environment before production.
BEGIN;

-- The definer owns identity tables. The caller is always the NOLOGIN,
-- NOINHERIT, NOBYPASSRLS canonical auth reader, not the application owner.
-- One hashed CAN session is the sole input: no caller-supplied role, Person,
-- Organization, Site, account or grant identifier can authorize access.
CREATE OR REPLACE FUNCTION education_v30.v301_can_staff_session_context(
  p_can_session_hash text
)
RETURNS TABLE (
  account_id uuid, session_id uuid, grant_id uuid, person_id uuid,
  role_code text, organization_id uuid, site_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $can_staff_auth$
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
      AND a.email_normalized !~* '^[^@[:space:]]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?\\.demo$'
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
  JOIN public.site_canonical_identity_links site_link
    ON site_link.public_site_id = source.can_site_id
      AND site_link.status = 'approved'
      AND site_link.confirmed_at IS NOT NULL
      AND site_link.reviewed_at IS NOT NULL
  JOIN education_v30.canonical_account_grants native_grant
    ON native_grant.person_id = person_link.canonical_principal_id
      AND native_grant.site_id = site_link.canonical_site_id
      AND native_grant.role_code = source.can_role
      AND native_grant.active = true
      AND native_grant.revoked_at IS NULL
  JOIN education_v30.canonical_accounts native_account
    ON native_account.id = native_grant.account_id
      AND native_account.email_verified_at IS NOT NULL
      AND native_account.disabled_at IS NULL
  JOIN education_v30.organizations native_org
    ON native_org.id = native_grant.organization_id
      AND native_org.status = 'active'
  JOIN education_v30.sites native_site
    ON native_site.id = native_grant.site_id
      AND native_site.status IN ('planning', 'active')
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
$can_staff_auth$;

REVOKE ALL ON FUNCTION
  education_v30.v301_can_staff_session_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  education_v30.v301_can_staff_session_context(text)
  TO can_v30_canonical_auth_reader;

COMMENT ON FUNCTION education_v30.v301_can_staff_session_context(text) IS
  'Restricted CAN-session staff projection. Rechecks verified one-login session, exact Person and Site links, current native staff grant and operator relationship. No raw identity SELECT is granted.';

COMMIT;
