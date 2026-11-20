-- This is an explicitly reviewed, operator-run grant script, not an app migration.
-- Canonical Site, Offering, reference, qualification and geographic records now
-- live in public. The availability function remains in education_v30.
-- Requires the scoped public.sites RLS policy before any privileges are granted.
-- Never use an owner/bypass-RLS application login. The catalog role is NOLOGIN.

\set ON_ERROR_STOP on

\if :{?organization_id}
\else
\echo "organization_id is required"
\quit 3
\endif
\if :{?program_catalog_role}
\else
\echo "program_catalog_role is required"
\quit 3
\endif
\if :{?application_role}
\else
\echo "application_role is required"
\quit 3
\endif

-- One role per approved Organization. This is a NOLOGIN purpose role
-- selected by an isolated application login using SET LOCAL ROLE.
-- A pre-existing LOGIN role is not silently converted or reused.
SELECT (
  :'program_catalog_role' = 'can_v30_program_catalog_' || lower(replace(:'organization_id', '-', ''))
  AND :'application_role' <> :'program_catalog_role'
  AND EXISTS(SELECT 1 FROM public.organizations
    WHERE id=:'organization_id'::uuid)
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='sites'
      AND policyname='sites_canonical_catalog_operator_read'
      AND permissive='PERMISSIVE' AND cmd='SELECT'
      AND 'public'=ANY(roles)
      AND qual LIKE '%v28_role_can_access_org%'
      AND qual LIKE '%site_organization_roles%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles app_role
    WHERE app_role.rolname=:'application_role'
      AND app_role.rolcanlogin AND NOT app_role.rolsuper
      AND NOT app_role.rolbypassrls AND NOT app_role.rolcreatedb
      AND NOT app_role.rolcreaterole AND NOT app_role.rolinherit
      AND NOT app_role.rolreplication
      AND NOT pg_has_role(app_role.oid,
        (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),
        'MEMBER')
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','education_v30','education_v30_secure')
          AND c.relowner=app_role.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','education_v30','education_v30_secure')
          AND p.proowner=app_role.oid
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_roles r WHERE r.rolname=:'program_catalog_role'
      AND (r.rolcanlogin OR r.rolsuper OR r.rolbypassrls
        OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit
        OR r.rolreplication
        OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
        OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n
          ON n.oid=c.relnamespace WHERE c.relowner=r.oid
          AND n.nspname IN ('public','education_v30','education_v30_secure'))
        OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n
          ON n.oid=p.pronamespace WHERE p.proowner=r.oid
          AND n.nspname IN ('public','education_v30','education_v30_secure')))
  )
) AS role_is_valid
\gset
\if :role_is_valid
\else
\echo 'Catalog provisioning requires an isolated non-owner app login and a restricted role'
\quit 3
\endif

SELECT format(
  'CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  :'program_catalog_role'
) WHERE NOT EXISTS(
  SELECT 1 FROM pg_roles WHERE rolname=:'program_catalog_role'
)
\gexec

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended(
  :'program_catalog_role' || ':' || :'application_role' || ':' || :'organization_id' || ':program_catalog', 0
));

SELECT format('GRANT USAGE ON SCHEMA public, education_v30 TO %I', :'program_catalog_role')
\gexec
SELECT format(
  'GRANT %I TO %I WITH INHERIT FALSE, SET TRUE',
  :'program_catalog_role',
  :'application_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, geographic_area_id, lifecycle_status) ON public.sites TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (site_id, organization_id, role_code, valid_from, valid_through) ON public.site_organization_roles TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id) ON public.geographic_areas TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, code, reference_kind, category, status, sort_order) ON public.blueprint_reference_items TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, item_id, version_no, title, summary, lifecycle) ON public.blueprint_reference_item_versions TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, code, title, status) ON public.offerings TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, offering_id, version_no, lifecycle) ON public.offering_versions TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, status) ON public.qualification_program_fit_policies TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, policy_id, offering_version_id, lifecycle) ON public.qualification_program_fit_policy_versions TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (policy_version_id, effective_at) ON public.qualification_program_fit_policy_version_withdrawals TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION education_v30.v28_role_can_access_org(uuid,text), education_v30.v28_role_has_purpose(text), education_v30.v30_catalog_program_availability(uuid,text) TO %I',
  :'program_catalog_role'
)
\gexec

INSERT INTO public.database_role_organization_bindings (
  db_role, organization_id, purpose_code, valid_from, status
)
SELECT
  :'program_catalog_role'::name,
  :'organization_id'::uuid,
  'program_catalog',
  clock_timestamp(),
  'approved'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.database_role_organization_bindings b
  WHERE b.db_role = :'program_catalog_role'::name
    AND b.organization_id = :'organization_id'::uuid
    AND b.purpose_code = 'program_catalog'
    AND b.status = 'approved'
    AND b.valid_from <= clock_timestamp()
    AND (b.valid_through IS NULL OR b.valid_through > clock_timestamp())
);
COMMIT;
