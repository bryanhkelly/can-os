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
-- Trusted administrator only. Restricted role must not own canonical tables.
SELECT (
 EXISTS(SELECT 1 FROM education_v30.organizations
  WHERE id=:'organization_id'::uuid AND status='active')
 AND EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=:'application_role'
  AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
  AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
  AND NOT pg_has_role(r.oid,
   (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),'MEMBER'))
) AS allowed
\gset
\if :allowed
\else
\echo 'An active organization and restricted NOINHERIT app login are required'
\quit 3
\endif
SELECT 'can_v30_survey_reviewer_' || lower(replace(:'organization_id','-','')) AS reviewer_role,
       'can_v30_survey_publisher_' || lower(replace(:'organization_id','-','')) AS publisher_role
\gset
SELECT format('CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',r)
FROM (VALUES (:'reviewer_role'),(:'publisher_role')) x(r)
WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r)
\gexec
SELECT (
 SELECT bool_and(NOT rolsuper AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolinherit
  AND NOT rolcreatedb AND NOT rolcreaterole)
 FROM pg_roles WHERE rolname IN (:'reviewer_role',:'publisher_role')
) AS roles_restricted
\gset
\if :roles_restricted
\else
\echo 'Survey review/publish roles must be restricted NOLOGIN NOINHERIT'
\quit 3
\endif
BEGIN;
SELECT format('GRANT USAGE ON SCHEMA education_v30 TO %I,%I',:'reviewer_role',:'publisher_role')
\gexec
SELECT format('GRANT %I,%I TO %I WITH INHERIT FALSE, SET TRUE',
 :'reviewer_role',:'publisher_role',:'application_role')
\gexec
SELECT format('GRANT SELECT ON education_v30.%I TO %I,%I',t,
 :'reviewer_role',:'publisher_role')
FROM unnest(ARRAY[
 'survey_definitions','survey_versions','survey_questions','survey_version_reviews'
]) t
\gexec
SELECT format('GRANT SELECT ON education_v30.survey_question_options TO %I',:'reviewer_role')
\gexec
-- Only non-sensitive verified evidence metadata, never storage keys or payloads.
SELECT format('GRANT SELECT (id,kind_code,owning_organization_id) ON education_v30.evidence_documents TO %I,%I',
 :'reviewer_role',:'publisher_role')
\gexec
SELECT format('GRANT SELECT (id,document_id,verified_at,valid_from,valid_through) ON education_v30.evidence_document_versions TO %I,%I',
 :'reviewer_role',:'publisher_role')
\gexec
SELECT format('GRANT INSERT ON education_v30.survey_version_reviews TO %I',:'reviewer_role')
\gexec
SELECT format('GRANT UPDATE (lifecycle,published_at) ON education_v30.survey_versions TO %I',:'publisher_role')
\gexec
SELECT format('GRANT INSERT ON education_v30.%I TO %I,%I',t,:'reviewer_role',:'publisher_role')
FROM unnest(ARRAY['audit_events','domain_events']) t
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION education_v30.v28_role_can_access_org(uuid,text) TO %I,%I',
 :'reviewer_role',:'publisher_role')
\gexec
INSERT INTO education_v30.database_role_organization_bindings
 (db_role,organization_id,purpose_code,valid_from,status)
SELECT x.role_name,:'organization_id'::uuid,x.purpose,clock_timestamp(),'approved'
FROM (VALUES
 (:'reviewer_role'::name,'survey_reviewer'),
 (:'publisher_role'::name,'survey_publisher')
) x(role_name,purpose)
WHERE NOT EXISTS(
 SELECT 1 FROM education_v30.database_role_organization_bindings b
 WHERE b.db_role=x.role_name AND b.organization_id=:'organization_id'::uuid
  AND b.purpose_code=x.purpose AND b.status='approved'
  AND b.valid_from<=clock_timestamp()
  AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp()));
COMMIT;
-- Reviewer has NO publication; publisher has NO independent review writes.
-- Neither may issue learner invitations, campaigns or responses.
