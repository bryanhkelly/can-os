\set ON_ERROR_STOP on
-- Apply after canonical schema.sql, as the trusted schema owner.
-- Scope is new DRAFT survey definitions/questions only. No publish/review rights.
BEGIN;
ALTER TABLE education_v30.database_role_organization_bindings
  DROP CONSTRAINT IF EXISTS database_role_organization_bindings_purpose_code_check;
ALTER TABLE education_v30.database_role_organization_bindings
  ADD CONSTRAINT database_role_organization_bindings_purpose_code_check CHECK(
    purpose_code IN (
      'training_registration','equipment_inventory','technology_support','read_only_reporting',
      'qualification_application','qualification_evidence','qualification_reviewer',
      'program_catalog','program_fit','program_activation','network_reporting',
      'blueprint_author','blueprint_reviewer','survey_draft_author'
    )
  );
DROP POLICY IF EXISTS survey_draft_definitions_read ON education_v30.survey_definitions;
CREATE POLICY survey_draft_definitions_read ON education_v30.survey_definitions
  FOR SELECT USING (education_v30.v28_role_can_access_org(owner_organization_id,'survey_draft_author'));
DROP POLICY IF EXISTS survey_draft_definitions_insert ON education_v30.survey_definitions;
CREATE POLICY survey_draft_definitions_insert ON education_v30.survey_definitions
  FOR INSERT WITH CHECK(status='active'
    AND education_v30.v28_role_can_access_org(owner_organization_id,'survey_draft_author'));
DROP POLICY IF EXISTS survey_draft_versions_read ON education_v30.survey_versions;
CREATE POLICY survey_draft_versions_read ON education_v30.survey_versions
  FOR SELECT USING(EXISTS(
    SELECT 1 FROM education_v30.survey_definitions d WHERE d.id=survey_id
      AND education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_draft_author')));
DROP POLICY IF EXISTS survey_draft_versions_insert ON education_v30.survey_versions;
CREATE POLICY survey_draft_versions_insert ON education_v30.survey_versions
  FOR INSERT WITH CHECK(lifecycle='draft' AND published_at IS NULL AND EXISTS(
    SELECT 1 FROM education_v30.survey_definitions d WHERE d.id=survey_id
      AND education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_draft_author')));
DROP POLICY IF EXISTS survey_draft_questions_read ON education_v30.survey_questions;
CREATE POLICY survey_draft_questions_read ON education_v30.survey_questions
  FOR SELECT USING(EXISTS(
    SELECT 1 FROM education_v30.survey_versions v
    JOIN education_v30.survey_definitions d ON d.id=v.survey_id
    WHERE v.id=survey_version_id
      AND education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_draft_author')));
DROP POLICY IF EXISTS survey_draft_questions_insert ON education_v30.survey_questions;
CREATE POLICY survey_draft_questions_insert ON education_v30.survey_questions
  FOR INSERT WITH CHECK(safety_triage=false AND question_type<>'matrix' AND EXISTS(
    SELECT 1 FROM education_v30.survey_versions v
    JOIN education_v30.survey_definitions d ON d.id=v.survey_id
    WHERE v.id=survey_version_id AND v.lifecycle='draft'
      AND education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_draft_author')));
DROP POLICY IF EXISTS survey_draft_options_read ON education_v30.survey_question_options;
CREATE POLICY survey_draft_options_read ON education_v30.survey_question_options
  FOR SELECT USING(EXISTS(
    SELECT 1 FROM education_v30.survey_questions q
    JOIN education_v30.survey_versions v ON v.id=q.survey_version_id
    JOIN education_v30.survey_definitions d ON d.id=v.survey_id
    WHERE q.id=question_id
      AND education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_draft_author')));
DROP POLICY IF EXISTS survey_draft_options_insert ON education_v30.survey_question_options;
CREATE POLICY survey_draft_options_insert ON education_v30.survey_question_options
  FOR INSERT WITH CHECK(EXISTS(
    SELECT 1 FROM education_v30.survey_questions q
    JOIN education_v30.survey_versions v ON v.id=q.survey_version_id
    JOIN education_v30.survey_definitions d ON d.id=v.survey_id
    WHERE q.id=question_id AND v.lifecycle='draft'
      AND q.question_type IN ('single_choice','multiple_choice')
      AND education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_draft_author')));
DROP POLICY IF EXISTS survey_draft_audit_insert ON education_v30.audit_events;
CREATE POLICY survey_draft_audit_insert ON education_v30.audit_events
  FOR INSERT WITH CHECK(event_code='survey.draft.created' AND entity_kind='survey_version'
    AND education_v30.v28_role_can_access_org(owning_organization_id,'survey_draft_author'));
DROP POLICY IF EXISTS survey_draft_domain_event_insert ON education_v30.domain_events;
CREATE POLICY survey_draft_domain_event_insert ON education_v30.domain_events
  FOR INSERT WITH CHECK(event_type='SurveyDraftCreated' AND aggregate_type='survey_version'
    AND EXISTS(SELECT 1 FROM education_v30.survey_versions v
    JOIN education_v30.survey_definitions d ON d.id=v.survey_id
    WHERE v.id=aggregate_id AND v.lifecycle='draft'
      AND education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_draft_author')));
COMMIT;
-- No UPDATE/DELETE policies and no survey publication or campaign authorization.
