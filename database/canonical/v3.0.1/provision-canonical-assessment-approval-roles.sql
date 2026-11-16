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
-- Trusted database administrator only. Independent read/review and final
-- publication are separate NOLOGIN roles. Neither gets direct table DML.
SELECT (
 EXISTS(SELECT 1 FROM education_v30.organizations
   WHERE id=:'organization_id'::uuid AND status='active')
 AND EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=:'application_role'
   AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
   AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
   AND NOT pg_has_role(r.oid,(SELECT nspowner
     FROM pg_namespace WHERE nspname='education_v30'),'MEMBER'))
) AS allowed
\gset
\if :allowed
\else
\echo 'Requires active organization and restricted NOINHERIT application login'
\quit 3
\endif
SELECT 'can_v30_assess_reviewer_' ||
 lower(replace(:'organization_id','-','')) AS reviewer_role,
 'can_v30_assess_publisher_' ||
 lower(replace(:'organization_id','-','')) AS publisher_role
\gset
SELECT format('CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',r)
FROM (VALUES(:'reviewer_role'),(:'publisher_role')) v(r)
WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r)
\gexec
SELECT count(*)=2 AND bool_and(NOT rolcanlogin AND NOT rolbypassrls AND
 NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole)
 AS roles_valid FROM pg_roles WHERE rolname IN(:'reviewer_role',:'publisher_role')
\gset
\if :roles_valid
\else
\echo 'Refusing privileged assessment approval roles'
\quit 3
\endif
BEGIN;
SELECT format('GRANT USAGE ON SCHEMA education_v30 TO %I,%I',
 :'reviewer_role',:'publisher_role')
\gexec
SELECT format('GRANT %I,%I TO %I WITH INHERIT FALSE, SET TRUE',
 :'reviewer_role',:'publisher_role',:'application_role')
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION education_v30.v28_role_can_access_org(uuid,text) TO %I,%I',
 :'reviewer_role',:'publisher_role')
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION education_v30.v301_list_objective_review_queue(uuid,uuid,text) TO %I,%I',
 :'reviewer_role',:'publisher_role')
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION education_v30.v301_objective_assessment_snapshot(uuid,uuid,uuid,text) TO %I,%I',
 :'reviewer_role',:'publisher_role')
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION education_v30.v301_record_objective_assessment_review(uuid,uuid,uuid,text,uuid,text,text,text) TO %I',
 :'reviewer_role')
\gexec
SELECT format('GRANT EXECUTE ON FUNCTION education_v30.v301_publish_objective_assessment(uuid,uuid,uuid) TO %I',
 :'publisher_role')
\gexec
-- Do NOT grant execution of the internal authorization function: it is
-- SECURITY DEFINER and is invoked by the limited review/publish wrappers.
INSERT INTO education_v30.database_role_organization_bindings(
 db_role,organization_id,purpose_code,valid_from,status)
SELECT x.role_name,:'organization_id'::uuid,x.purpose,clock_timestamp(),'approved'
FROM (VALUES
 (:'reviewer_role'::name,'assessment_reviewer'),
 (:'publisher_role'::name,'assessment_publisher')
) x(role_name,purpose)
WHERE NOT EXISTS(SELECT 1 FROM education_v30.database_role_organization_bindings b
 WHERE b.db_role=x.role_name AND b.organization_id=:'organization_id'::uuid
 AND b.purpose_code=x.purpose AND b.status='approved'
 AND b.valid_from<=clock_timestamp()
 AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp()));
COMMIT;
-- Reviewer cannot publish and publisher cannot record reviews. Neither
-- role may SELECT answer keys or write arbitrary assessments or results.
SELECT has_function_privilege(:'reviewer_role',
 'education_v30.v301_record_objective_assessment_review(uuid,uuid,uuid,text,uuid,text,text,text)',
 'EXECUTE') AS reviewer_can_review,
 has_function_privilege(:'publisher_role',
 'education_v30.v301_publish_objective_assessment(uuid,uuid,uuid)',
 'EXECUTE') AS publisher_can_publish,
 has_function_privilege(:'reviewer_role',
 'education_v30.v301_publish_objective_assessment(uuid,uuid,uuid)',
 'EXECUTE') AS reviewer_can_publish,
 has_function_privilege(:'publisher_role',
 'education_v30.v301_record_objective_assessment_review(uuid,uuid,uuid,text,uuid,text,text,text)',
 'EXECUTE') AS publisher_can_review,
 has_table_privilege(:'reviewer_role',
 'education_v30.assessment_item_secure_keys','SELECT') AS reviewer_can_read_keys,
 has_table_privilege(:'publisher_role',
 'education_v30.assessment_versions','UPDATE') AS publisher_can_directly_publish;
