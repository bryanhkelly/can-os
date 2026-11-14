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

-- All three identities are native CAN OS v3.0.1 database objects.
-- This script is run only by a trusted schema administrator.
SELECT (
 EXISTS(SELECT 1 FROM education_v30.organizations
   WHERE id=:'organization_id'::uuid AND status='active')
 AND EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=:'application_role'
   AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
   AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
   AND NOT pg_has_role(r.oid,
     (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),'MEMBER'))
) AS provision_allowed
\gset
\if :provision_allowed
\else
\echo 'Provisioning requires a real v3 Organization and a restricted application login'
\quit 3
\endif

SELECT 'can_v30_blueprint_author_' || lower(replace(:'organization_id','-','')) AS author_role,
       'can_v30_blueprint_reviewer_' || lower(replace(:'organization_id','-','')) AS reviewer_role
\gset

SELECT format('CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  :'author_role')
WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'author_role')
\gexec
SELECT format('CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  :'reviewer_role')
WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=:'reviewer_role')
\gexec

SELECT (
 SELECT bool_and(NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolinherit AND NOT rolcanlogin)
 FROM pg_roles WHERE rolname IN (:'author_role',:'reviewer_role')
) AS restricted_roles
\gset
\if :restricted_roles
\else
\echo 'Blueprint roles must be restricted NOLOGIN, NOINHERIT roles'
\quit 3
\endif

BEGIN;
SELECT format('GRANT USAGE ON SCHEMA education_v30 TO %I,%I',
 :'author_role',:'reviewer_role')
\gexec
SELECT format('GRANT %I,%I TO %I WITH INHERIT FALSE, SET TRUE',
 :'author_role',:'reviewer_role',:'application_role')
\gexec
SELECT format(
 'GRANT EXECUTE ON FUNCTION education_v30.v28_role_can_access_org(uuid,text), education_v30.v28_role_has_purpose(text) TO %I,%I',
 :'author_role',:'reviewer_role')
\gexec

-- Both purposes read the published recipe library and their own configurations.
SELECT format(
 'GRANT SELECT ON education_v30.%I TO %I,%I', t,
 :'author_role',:'reviewer_role')
FROM unnest(ARRAY[
 'blueprints','blueprint_versions','blueprint_components',
 'religious_affiliation_options','blueprint_reference_items',
 'blueprint_reference_item_versions','offerings','offering_versions',
 'blueprint_configurations','blueprint_configuration_versions',
 'blueprint_configuration_components','blueprint_configuration_component_references',
 'blueprint_configuration_local_experiences','blueprint_configuration_offering_intents',
 'configuration_reviews','blueprint_component_approval_decisions','audit_events']) AS t
\gexec
-- Site authoring requires current, verified operator authority.
SELECT format('GRANT SELECT (id,status) ON education_v30.sites TO %I', :'author_role')
\gexec
SELECT format(
 'GRANT SELECT (site_id,organization_id,role_code,valid_from,valid_through) ON education_v30.site_organization_roles TO %I',
 :'author_role')
\gexec

SELECT format('GRANT INSERT ON education_v30.%I TO %I', t, :'author_role')
FROM unnest(ARRAY[
 'blueprint_configurations','blueprint_configuration_versions',
 'blueprint_configuration_components','blueprint_configuration_component_references',
 'blueprint_configuration_local_experiences','blueprint_configuration_offering_intents']) AS t
\gexec
SELECT format(
 'GRANT UPDATE (lifecycle,frozen_at) ON education_v30.blueprint_configuration_versions TO %I',
 :'author_role')
\gexec

-- Reviewer can see verification *labels*, never document storage references.
SELECT format(
 'GRANT SELECT (id,kind_code,owning_organization_id,title) ON education_v30.evidence_documents TO %I',
 :'reviewer_role')
\gexec
SELECT format(
 'GRANT SELECT (id,document_id,verified_at,valid_from,valid_through) ON education_v30.evidence_document_versions TO %I',
 :'reviewer_role')
\gexec
SELECT format('GRANT INSERT ON education_v30.%I TO %I', t, :'reviewer_role')
FROM unnest(ARRAY['configuration_reviews','blueprint_component_approval_decisions']) AS t
\gexec
SELECT format('GRANT USAGE ON SEQUENCE %s TO %I',
 pg_get_serial_sequence('education_v30.blueprint_component_approval_decisions','decision_order'),
 :'reviewer_role')
\gexec

-- Trace-only, append-friendly event rights. Neither role can erase history.
SELECT format('GRANT INSERT ON education_v30.%I TO %I,%I',
 t, :'author_role',:'reviewer_role')
FROM unnest(ARRAY['audit_events','domain_events']) AS t
\gexec

INSERT INTO education_v30.database_role_organization_bindings
 (db_role,organization_id,purpose_code,valid_from,status)
SELECT r.role_name,:'organization_id'::uuid,r.purpose,clock_timestamp(),'approved'
FROM (VALUES
 (:'author_role'::name,'blueprint_author'),
 (:'reviewer_role'::name,'blueprint_reviewer')
) AS r(role_name,purpose)
WHERE NOT EXISTS (
 SELECT 1 FROM education_v30.database_role_organization_bindings b
 WHERE b.db_role=r.role_name AND b.organization_id=:'organization_id'::uuid
   AND b.purpose_code=r.purpose AND b.status='approved'
   AND b.valid_from<=clock_timestamp()
   AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp())
);
COMMIT;

-- This grants no direct permission to native session tables, safeguarding,
-- learners, money, or an approved Program Deployment.
