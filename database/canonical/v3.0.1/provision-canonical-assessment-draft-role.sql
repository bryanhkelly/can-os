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
-- Trusted DBA only, AFTER patch-canonical-assessment-draft-authoring.sql.
-- This role gets EXECUTE on ONE draft-only definer, not arbitrary DML,
-- publication, review, administration, private answer read, grades or awards.
SELECT (
 EXISTS(SELECT 1 FROM education_v30.organizations
  WHERE id=:'organization_id'::uuid AND status='active')
 AND EXISTS(SELECT 1 FROM pg_roles r
  WHERE r.rolname=:'application_role' AND r.rolcanlogin
    AND NOT r.rolsuper AND NOT r.rolbypassrls
    AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
    AND NOT pg_has_role(r.oid,
      (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),'MEMBER'))
) AS allowed
\gset
\if :allowed
\else
\echo 'Requires active publisher organization and restricted NOINHERIT application login'
\quit 3
\endif
SELECT 'can_v30_assessment_draft_author_' ||
 lower(replace(:'organization_id','-','')) AS draft_role
\gset
SELECT format('CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',
 :'draft_role')
WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'draft_role')
\gexec
SELECT EXISTS(
 SELECT 1 FROM pg_roles r WHERE r.rolname=:'draft_role'
 AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
 AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
) AS role_valid
\gset
\if :role_valid
\else
\echo 'Refused privileged or inheriting draft writer role'
\quit 3
\endif
BEGIN;
SELECT format('GRANT USAGE ON SCHEMA education_v30 TO %I',:'draft_role')
\gexec
SELECT format('GRANT %I TO %I WITH INHERIT FALSE, SET TRUE',
 :'draft_role',:'application_role')
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION education_v30.v301_create_objective_assessment_draft(uuid,uuid,uuid,text,text,numeric,integer,jsonb) TO %I',
 :'draft_role')
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION education_v30.v301_list_objective_assessment_drafts(uuid,uuid) TO %I',
 :'draft_role')
\gexec
INSERT INTO education_v30.database_role_organization_bindings
(db_role,organization_id,purpose_code,valid_from,status)
SELECT :'draft_role'::name,:'organization_id'::uuid,
'assessment_draft_author',clock_timestamp(),'approved'
WHERE NOT EXISTS(
 SELECT 1 FROM education_v30.database_role_organization_bindings b
 WHERE b.db_role=:'draft_role'::name
 AND b.organization_id=:'organization_id'::uuid
 AND b.purpose_code='assessment_draft_author' AND b.status='approved'
 AND b.valid_from<=clock_timestamp()
 AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp()));
COMMIT;
-- Assert the restricted role does not inherit dangerous capabilities.
SELECT
 has_function_privilege(:'draft_role',
  'education_v30.v301_create_objective_assessment_draft(uuid,uuid,uuid,text,text,numeric,integer,jsonb)','EXECUTE') AS can_create_only_draft,
 has_table_privilege(:'draft_role','education_v30.assessment_item_secure_keys','SELECT') AS can_read_keys,
 has_table_privilege(:'draft_role','education_v30.assessment_versions','UPDATE') AS can_publish,
 has_table_privilege(:'draft_role','education_v30.assessment_administrations','INSERT') AS can_administer;
