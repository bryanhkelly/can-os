\set ON_ERROR_STOP on

\if :{?application_role}
\else
\echo "application_role is required"
\quit 3
\endif

SELECT (
  :'application_role' <> 'can_v30_public_site_reader'
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'can_v30_public_site_reader'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit
      AND NOT EXISTS (
        SELECT 1 FROM pg_auth_members m
        WHERE m.member = pg_roles.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND c.relowner = pg_roles.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND p.proowner = pg_roles.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_namespace n
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND n.nspowner = pg_roles.oid
      )
      AND NOT pg_has_role(
        pg_roles.oid,
        (SELECT nspowner FROM pg_namespace WHERE nspname = 'education_v30'),
        'MEMBER'
      )
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = :'application_role'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND c.relowner = pg_roles.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND p.proowner = pg_roles.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_namespace n
        WHERE n.nspname IN ('education_v30', 'education_v30_secure')
          AND n.nspowner = pg_roles.oid
      )
      AND NOT pg_has_role(
        pg_roles.oid,
        (SELECT nspowner FROM pg_namespace WHERE nspname = 'education_v30'),
        'MEMBER'
      )
  )
) AS roles_are_valid
\gset

\if :roles_are_valid
\else
\echo "Use a restricted NOLOGIN public-reader role and a restricted application login."
\quit 3
\endif

BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended(
  :'application_role' || ':public_site_reader', 0
));
GRANT USAGE ON SCHEMA education_v30 TO can_v30_public_site_reader;
GRANT EXECUTE ON FUNCTION education_v30.v301_public_site_claims(text)
  TO can_v30_public_site_reader;
GRANT can_v30_public_site_reader TO :"application_role"
  WITH INHERIT FALSE, SET TRUE;
COMMIT;
