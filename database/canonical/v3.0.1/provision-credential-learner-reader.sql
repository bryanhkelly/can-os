\\set ON_ERROR_STOP on
\\if :{?application_role}
\\else
\\echo 'application_role must be the existing restricted canonical app login'
\\quit 3
\\endif

-- Trusted owner provisioning only. The role reads two session-bound
-- SECURITY DEFINER projections. It receives NO direct table privileges.
SELECT (
 EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=:'application_role'
  AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
  AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
  AND NOT pg_has_role(r.oid,
    (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),'MEMBER'))
) AS provision_allowed
\\gset
\\if :provision_allowed
\\else
\\echo 'Refused: application login must be restricted and not the schema owner'
\\quit 3
\\endif

SELECT format('CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',
 'can_v301_credential_learner_reader')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='can_v301_credential_learner_reader')
\\gexec

SELECT (
 EXISTS(SELECT 1 FROM pg_roles r
  WHERE r.rolname='can_v301_credential_learner_reader'
  AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
  AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit)
) AS reader_role_valid
\\gset
\\if :reader_role_valid
\\else
\\echo 'Refused: credential reader role is not least-privilege'
\\quit 3
\\endif

BEGIN;
GRANT USAGE ON SCHEMA education_v30 TO can_v301_credential_learner_reader;
GRANT EXECUTE ON FUNCTION
 education_v30.v301_list_my_learning_awards(text),
 education_v30.v301_get_my_learning_award(text,uuid)
 TO can_v301_credential_learner_reader;
SELECT format(
 'GRANT can_v301_credential_learner_reader TO %I WITH INHERIT FALSE, SET TRUE',
 :'application_role')
\\gexec
COMMIT;

-- No raw award table, canonical session, PERSON, document or guardian grants.
