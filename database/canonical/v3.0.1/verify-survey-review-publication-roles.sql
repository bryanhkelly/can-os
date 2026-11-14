\set ON_ERROR_STOP on
\if :{?organization_id}
\else
\echo 'organization_id is required'
\quit 3
\endif
-- Read-only preflight under a trusted schema administrator on isolated test DB.
SELECT 'can_v30_survey_reviewer_' || lower(replace(:'organization_id','-','')) AS reviewer_role,
       'can_v30_survey_publisher_' || lower(replace(:'organization_id','-','')) AS publisher_role
\gset
SELECT (
  (SELECT count(*)=2 FROM pg_roles r
   WHERE r.rolname IN (:'reviewer_role',:'publisher_role')
     AND NOT r.rolsuper AND NOT r.rolcanlogin AND NOT r.rolbypassrls
     AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole)
  AND (SELECT count(*)=2
   FROM education_v30.database_role_organization_bindings b
   WHERE b.organization_id=:'organization_id'::uuid AND b.status='approved'
     AND b.valid_from<=clock_timestamp() AND
     (b.valid_through IS NULL OR b.valid_through>clock_timestamp())
     AND ((b.db_role=:'reviewer_role'::name AND b.purpose_code='survey_reviewer')
       OR (b.db_role=:'publisher_role'::name AND b.purpose_code='survey_publisher')))
  AND (SELECT count(*)=11 FROM pg_policies p WHERE p.schemaname='education_v30'
    AND p.policyname IN (
     'survey_review_definitions_select','survey_review_versions_select',
     'survey_review_questions_select','survey_review_options_select',
     'survey_reviews_select','survey_reviews_insert','survey_publisher_update',
     'survey_approval_audit_insert','survey_approval_domain_insert',
     'survey_approval_evidence_documents_read','survey_approval_evidence_versions_read'))
  AND EXISTS(SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='education_v30.survey_version_reviews'::regclass
      AND t.tgname='survey_independent_review_gate' AND t.tgenabled<>'D')
  AND EXISTS(SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='education_v30.survey_versions'::regclass
      AND t.tgname='survey_publication_evidence_gate' AND t.tgenabled<>'D')
  AND has_table_privilege(:'reviewer_role','education_v30.survey_version_reviews','INSERT')
  AND NOT has_column_privilege(:'reviewer_role','education_v30.survey_versions','lifecycle','UPDATE')
  AND has_column_privilege(:'publisher_role','education_v30.survey_versions','lifecycle','UPDATE')
  AND has_column_privilege(:'publisher_role','education_v30.survey_versions','published_at','UPDATE')
  AND NOT has_column_privilege(:'publisher_role','education_v30.survey_versions','author_person_id','UPDATE')
  AND NOT has_table_privilege(:'publisher_role','education_v30.survey_version_reviews','INSERT')
  AND has_column_privilege(:'reviewer_role','education_v30.evidence_document_versions','verified_at','SELECT')
  AND has_column_privilege(:'publisher_role','education_v30.evidence_document_versions','verified_at','SELECT')
  AND NOT has_column_privilege(:'reviewer_role','education_v30.evidence_document_versions','storage_reference','SELECT')
  AND NOT has_column_privilege(:'publisher_role','education_v30.evidence_document_versions','source_uri','SELECT')
  AND NOT has_table_privilege(:'reviewer_role','education_v30.survey_campaigns','INSERT')
  AND NOT has_table_privilege(:'publisher_role','education_v30.survey_campaigns','INSERT')
  AND NOT has_table_privilege(:'reviewer_role','education_v30.survey_invitations','INSERT')
  AND NOT has_table_privilege(:'publisher_role','education_v30.survey_invitations','INSERT')
  AND NOT has_table_privilege(:'reviewer_role','education_v30.survey_responses','SELECT')
  AND NOT has_table_privilege(:'publisher_role','education_v30.survey_responses','SELECT')
) AS survey_approval_roles_verified
\gset
\if :survey_approval_roles_verified
\echo 'Survey review/publish restricted role checks passed'
\else
\echo 'Survey review/publish role or policy checks failed; keep feature flags off'
\quit 3
\endif
-- NOT full transaction isolation, role-based DML denial or browser acceptance.
