\set ON_ERROR_STOP on
\if :{?application_role}
\else
\echo 'application_role must name an existing restricted CAN OS login'
\quit 3
\endif

-- Provision after installing schema.sql, using a trusted database owner.
-- This role can authenticate a v3 session, but cannot read any identity table.
SELECT format(
 'CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',
 'can_v30_canonical_auth_reader'
)
WHERE NOT EXISTS (
 SELECT 1 FROM pg_roles WHERE rolname='can_v30_canonical_auth_reader'
)
\gexec

SELECT (
 EXISTS (
  SELECT 1 FROM pg_roles r
  WHERE r.rolname='can_v30_canonical_auth_reader'
   AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
   AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
   AND NOT r.rolreplication
 )
 AND EXISTS (
  SELECT 1 FROM pg_roles a WHERE a.rolname=:'application_role'
   AND a.rolcanlogin AND NOT a.rolsuper AND NOT a.rolbypassrls
   AND NOT a.rolcreatedb AND NOT a.rolcreaterole AND NOT a.rolinherit
 )
 AND :'application_role'<>'can_v30_canonical_auth_reader'
 AND NOT pg_has_role(
  (SELECT oid FROM pg_roles WHERE rolname=:'application_role'),
  (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),
  'MEMBER'
 )
) AS roles_valid
\gset
\if :roles_valid
\else
\echo 'Canonical authentication requires restricted non-owner roles'
\quit 3
\endif

BEGIN;
SELECT format('GRANT USAGE ON SCHEMA education_v30 TO %I',
 'can_v30_canonical_auth_reader')
\gexec
SELECT format(
 'GRANT EXECUTE ON FUNCTION education_v30.v301_canonical_session_context(text) TO %I',
 'can_v30_canonical_auth_reader'
)
\gexec
SELECT format('GRANT %I TO %I WITH INHERIT FALSE, SET TRUE',
 'can_v30_canonical_auth_reader', :'application_role')
\gexec
COMMIT;

-- The session projection is SECURITY DEFINER and read-only. Never grant
-- SELECT on canonical_sessions, canonical_accounts or account grants.
