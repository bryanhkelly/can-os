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

SELECT (
  :'program_catalog_role' = 'can_v30_program_catalog_' || lower(replace(:'organization_id', '-', ''))
  AND :'application_role' <> :'program_catalog_role'
  AND EXISTS (
    SELECT 1
    FROM education_v30.organizations
    WHERE id = :'organization_id'::uuid
  )
  AND EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'program_catalog_role'
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolbypassrls
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolinherit
      AND NOT rolreplication
      AND NOT EXISTS (
        SELECT 1
        FROM pg_auth_members m
        WHERE m.member = pg_roles.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND c.relowner = pg_roles.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND p.proowner = pg_roles.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_namespace n
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND n.nspowner = pg_roles.oid
      )
  )
  AND EXISTS (
    SELECT 1
    FROM pg_roles app_role
    WHERE app_role.rolname = :'application_role'
      AND app_role.rolcanlogin
      AND NOT app_role.rolsuper
      AND NOT app_role.rolbypassrls
      AND NOT app_role.rolcreatedb
      AND NOT app_role.rolcreaterole
      AND NOT app_role.rolinherit
      AND NOT app_role.rolreplication
      AND NOT pg_has_role(
        app_role.oid,
        (SELECT nspowner FROM pg_namespace WHERE nspname = 'education_v30'),
        'MEMBER'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND c.relowner = app_role.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND p.proowner = app_role.oid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_namespace n
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND n.nspowner = app_role.oid
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE n.nspname = 'education_v30'
      AND r.rolname = :'program_catalog_role'
  )
  AND NOT pg_has_role(
    (SELECT oid FROM pg_roles WHERE rolname = :'program_catalog_role'),
    (SELECT nspowner FROM pg_namespace WHERE nspname = 'education_v30'),
    'MEMBER'
  )
) AS role_is_valid
\gset

\if :role_is_valid
\else
\echo "Catalog and application roles must be isolated non-owner, non-superuser logins with NOINHERIT."
\quit 3
\endif

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended(
  :'program_catalog_role' || ':' || :'application_role' || ':' || :'organization_id' || ':program_catalog', 0
));

SELECT format('GRANT USAGE ON SCHEMA education_v30 TO %I', :'program_catalog_role')
\gexec
SELECT format(
  'GRANT %I TO %I WITH INHERIT FALSE, SET TRUE',
  :'program_catalog_role',
  :'application_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, geographic_area_id, status) ON education_v30.sites TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (site_id, organization_id, role_code, valid_from, valid_through) ON education_v30.site_organization_roles TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id) ON education_v30.geographic_areas TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, code, reference_kind, category, status, sort_order) ON education_v30.blueprint_reference_items TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, item_id, version_no, title, summary, lifecycle) ON education_v30.blueprint_reference_item_versions TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, code, title, status) ON education_v30.offerings TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, offering_id, version_no, lifecycle) ON education_v30.offering_versions TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, status) ON education_v30.qualification_program_fit_policies TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (id, policy_id, offering_version_id, lifecycle) ON education_v30.qualification_program_fit_policy_versions TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT SELECT (policy_version_id, effective_at) ON education_v30.qualification_program_fit_policy_version_withdrawals TO %I',
  :'program_catalog_role'
)
\gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION education_v30.v28_role_can_access_org(uuid,text), education_v30.v28_role_has_purpose(text), education_v30.v30_catalog_program_availability(uuid,text) TO %I',
  :'program_catalog_role'
)
\gexec

INSERT INTO education_v30.database_role_organization_bindings (
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
  FROM education_v30.database_role_organization_bindings b
  WHERE b.db_role = :'program_catalog_role'::name
    AND b.organization_id = :'organization_id'::uuid
    AND b.purpose_code = 'program_catalog'
    AND b.status = 'approved'
    AND b.valid_from <= clock_timestamp()
    AND (b.valid_through IS NULL OR b.valid_through > clock_timestamp())
);
COMMIT;
