\set ON_ERROR_STOP on
\if :{?organization_id}
\else
\echo 'organization_id is required'
\quit 3
\endif
\if :{?application_role}
\else
\echo 'application_role is required'
\quit 3
\endif
-- Trusted administrator only: scoped NOLOGIN role and audited INSERT privilege.
SELECT (
 EXISTS (SELECT 1 FROM education_v30.organizations
   WHERE id=:'organization_id'::uuid AND status='active')
 AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname=:'application_role'
   AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
   AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
   AND NOT pg_has_role(r.oid,
     (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),'MEMBER'))
) AS allowed
\gset
\if :allowed
\else
\echo 'Requires an active organization and restricted NOINHERIT application login'
\quit 3
\endif
SELECT 'can_v30_survey_draft_author_' || lower(replace(:'organization_id','-','')) AS draft_role
\gset
SELECT format('CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',
 :'draft_role')
WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'draft_role')
\gexec
SELECT (
 EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=:'draft_role'
   AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
   AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit)
) AS role_valid
\gset
\if :role_valid
\else
\echo 'Refused a privileged or inheriting writer role'
\quit 3
\endif
BEGIN;
SELECT format('GRANT USAGE ON SCHEMA education_v30 TO %I',:'draft_role')
\gexec
SELECT format('GRANT %I TO %I WITH INHERIT FALSE, SET TRUE',
 :'draft_role',:'application_role')
\gexec
SELECT format('GRANT SELECT,INSERT ON education_v30.%I TO %I',t,:'draft_role')
FROM unnest(ARRAY['survey_definitions','survey_versions',
 'survey_questions','survey_question_options']) AS t
\gexec
SELECT format('GRANT INSERT ON education_v30.%I TO %I',t,:'draft_role')
FROM unnest(ARRAY['audit_events','domain_events']) AS t
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION education_v30.v28_role_can_access_org(uuid,text) TO %I',
 :'draft_role')
\gexec
INSERT INTO education_v30.database_role_organization_bindings
 (db_role,organization_id,purpose_code,valid_from,status)
SELECT :'draft_role'::name,:'organization_id'::uuid,'survey_draft_author',
 clock_timestamp(),'approved'
WHERE NOT EXISTS(
 SELECT 1 FROM education_v30.database_role_organization_bindings b
 WHERE b.db_role=:'draft_role'::name
 AND b.organization_id=:'organization_id'::uuid
 AND b.purpose_code='survey_draft_author' AND b.status='approved'
 AND b.valid_from<=clock_timestamp()
 AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp()));
COMMIT;
-- No publication, reviewer, invitation, response, safeguarding or UPDATE rights.
