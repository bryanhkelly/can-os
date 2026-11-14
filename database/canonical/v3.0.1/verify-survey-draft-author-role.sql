\set ON_ERROR_STOP on
\if :{?organization_id}
\else
\echo 'organization_id is required'
\quit 3
\endif
-- Run read-only under trusted schema administrator on the isolated test DB.
SELECT 'can_v30_survey_draft_author_' || lower(replace(:'organization_id','-','')) AS draft_role
\gset
SELECT (
 EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=:'draft_role'
   AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
   AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole)
 AND EXISTS(SELECT 1 FROM education_v30.database_role_organization_bindings b
   WHERE b.db_role=:'draft_role'::name
     AND b.organization_id=:'organization_id'::uuid
     AND b.purpose_code='survey_draft_author' AND b.status='approved'
     AND b.valid_from<=clock_timestamp()
     AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp()))
 AND (SELECT count(*) FROM pg_policies
      WHERE schemaname='education_v30'
        AND policyname IN (
          'survey_draft_definitions_read','survey_draft_definitions_insert',
          'survey_draft_versions_read','survey_draft_versions_insert',
          'survey_draft_questions_read','survey_draft_questions_insert',
          'survey_draft_options_read','survey_draft_options_insert',
          'survey_draft_audit_insert','survey_draft_domain_event_insert'
        ))=10
 AND NOT EXISTS(SELECT 1 FROM pg_class c
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='education_v30'
       AND c.relname IN ('survey_definitions','survey_versions',
          'survey_questions','survey_question_options')
       AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity))
 AND has_table_privilege(:'draft_role','education_v30.survey_definitions','SELECT')
 AND has_table_privilege(:'draft_role','education_v30.survey_definitions','INSERT')
 AND has_table_privilege(:'draft_role','education_v30.survey_versions','SELECT')
 AND has_table_privilege(:'draft_role','education_v30.survey_versions','INSERT')
 AND has_table_privilege(:'draft_role','education_v30.survey_questions','SELECT')
 AND has_table_privilege(:'draft_role','education_v30.survey_questions','INSERT')
 AND has_table_privilege(:'draft_role','education_v30.survey_question_options','INSERT')
 AND NOT has_table_privilege(:'draft_role','education_v30.survey_versions','UPDATE')
 AND NOT has_table_privilege(:'draft_role','education_v30.survey_versions','DELETE')
 AND NOT has_table_privilege(:'draft_role','education_v30.survey_campaigns','INSERT')
 AND NOT has_table_privilege(:'draft_role','education_v30.survey_version_reviews','INSERT')
 AND NOT has_table_privilege(:'draft_role','education_v30.survey_invitations','INSERT')
 AND NOT has_table_privilege(:'draft_role','education_v30.survey_responses','INSERT')
 AND NOT has_table_privilege(:'draft_role','education_v30.survey_answers','SELECT')
) AS survey_role_verified
\gset
\if :survey_role_verified
\echo 'Survey draft role policies and nonpublication privileges verified'
\else
\echo 'Survey draft role verification failed. Do not enable the rollout flag.'
\quit 3
\endif
-- This static grant/policy check is not cross-tenant DML or browser acceptance.
