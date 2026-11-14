\set ON_ERROR_STOP on
-- OPTIONAL capability patch for an isolated canonical v3.0.1 test database.
-- Requires schema.sql and patch-survey-draft-authoring.sql first.
-- Must be run only by the trusted schema owner. Does NOT grant access to app login.
BEGIN;

-- Explicit new canonical, organization-wide independent reviewer identity.
ALTER TABLE education_v30.canonical_account_grants
  DROP CONSTRAINT IF EXISTS canonical_account_grants_role_code_check;
ALTER TABLE education_v30.canonical_account_grants
  DROP CONSTRAINT IF EXISTS canonical_account_grants_check;
ALTER TABLE education_v30.canonical_account_grants
  DROP CONSTRAINT IF EXISTS canonical_account_grants_site_role_check;
ALTER TABLE education_v30.canonical_account_grants
  ADD CONSTRAINT canonical_account_grants_role_code_check
    CHECK(role_code IN ('site_admin','registrar','blueprint_reviewer','survey_reviewer','learner'));
ALTER TABLE education_v30.canonical_account_grants
  ADD CONSTRAINT canonical_account_grants_site_role_check
    CHECK((role_code IN ('blueprint_reviewer','survey_reviewer','learner') AND site_id IS NULL)
       OR (role_code IN ('site_admin','registrar') AND site_id IS NOT NULL));

-- The session projection is the ONLY trusted reader of the hashed canonical token.
-- Preserve all existing verified-account, grant, last-activity, organization and Site gates.
CREATE OR REPLACE FUNCTION education_v30.v301_canonical_session_context(p_secret_hash text)
RETURNS TABLE (
 account_id uuid, session_id uuid, grant_id uuid, person_id uuid,
 role_code text, organization_id uuid, site_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $survey_auth$
 SELECT a.id, s.id, g.id, g.person_id, g.role_code, g.organization_id, g.site_id
 FROM canonical_sessions s
 JOIN canonical_accounts a ON a.id=s.account_id
 JOIN canonical_account_grants g ON g.id=s.active_grant_id AND g.account_id=a.id
 JOIN organizations o ON o.id=g.organization_id
 WHERE s.secret_hash=p_secret_hash
   AND a.email_verified_at IS NOT NULL AND a.disabled_at IS NULL
   AND g.active AND g.revoked_at IS NULL
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
   AND s.last_activity_at>clock_timestamp()-interval '30 minutes'
   AND o.status='active'
   AND (
      (g.role_code IN ('blueprint_reviewer','survey_reviewer','learner') AND g.site_id IS NULL)
      OR (g.role_code IN ('site_admin','registrar') AND EXISTS (
        SELECT 1 FROM site_organization_roles sor
        JOIN sites st ON st.id=sor.site_id
        WHERE sor.site_id=g.site_id AND sor.organization_id=g.organization_id
          AND sor.role_code='operator' AND sor.valid_from<=clock_timestamp()
          AND (sor.valid_through IS NULL OR sor.valid_through>clock_timestamp())
          AND st.status<>'closed'))
   )
$survey_auth$;
REVOKE ALL ON FUNCTION education_v30.v301_canonical_session_context(text) FROM PUBLIC;

-- The draft patch already added survey_draft_author. Preserve it.
ALTER TABLE education_v30.database_role_organization_bindings
  DROP CONSTRAINT IF EXISTS database_role_organization_bindings_purpose_code_check;
ALTER TABLE education_v30.database_role_organization_bindings
  ADD CONSTRAINT database_role_organization_bindings_purpose_code_check CHECK(
    purpose_code IN (
     'training_registration','equipment_inventory','technology_support','read_only_reporting',
     'qualification_application','qualification_evidence','qualification_reviewer',
     'program_catalog','program_fit','program_activation','network_reporting',
     'blueprint_author','blueprint_reviewer','survey_draft_author',
     'survey_reviewer','survey_publisher'
    )
  );

-- Reviewer and publisher may see only their bound organization's survey definitions.
CREATE POLICY survey_review_definitions_select ON education_v30.survey_definitions FOR SELECT USING (
 education_v30.v28_role_can_access_org(owner_organization_id,'survey_reviewer') OR
 education_v30.v28_role_can_access_org(owner_organization_id,'survey_publisher'));
CREATE POLICY survey_review_versions_select ON education_v30.survey_versions FOR SELECT USING (
 EXISTS(SELECT 1 FROM education_v30.survey_definitions d WHERE d.id=survey_id
  AND (education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_reviewer')
       OR education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_publisher'))));
CREATE POLICY survey_review_questions_select ON education_v30.survey_questions FOR SELECT USING (
 EXISTS(SELECT 1 FROM education_v30.survey_versions v
 JOIN education_v30.survey_definitions d ON d.id=v.survey_id
 WHERE v.id=survey_version_id
  AND (education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_reviewer')
       OR education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_publisher'))));
CREATE POLICY survey_review_options_select ON education_v30.survey_question_options FOR SELECT USING (
 EXISTS(SELECT 1 FROM education_v30.survey_questions q
 JOIN education_v30.survey_versions v ON v.id=q.survey_version_id
 JOIN education_v30.survey_definitions d ON d.id=v.survey_id
 WHERE q.id=question_id AND
  education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_reviewer')));
CREATE POLICY survey_reviews_select ON education_v30.survey_version_reviews FOR SELECT USING (
 EXISTS(SELECT 1 FROM education_v30.survey_versions v
 JOIN education_v30.survey_definitions d ON d.id=v.survey_id
 WHERE v.id=survey_version_id AND
  (education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_reviewer')
   OR education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_publisher'))));
CREATE POLICY survey_reviews_insert ON education_v30.survey_version_reviews FOR INSERT WITH CHECK (
 review_kind IN ('privacy','accessibility','safeguarding') AND
 EXISTS(SELECT 1 FROM education_v30.survey_versions v
 JOIN education_v30.survey_definitions d ON d.id=v.survey_id
 WHERE v.id=survey_version_id AND v.lifecycle='draft'
   AND v.author_person_id<>reviewer_person_id AND
   education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_reviewer')));

-- Version transitions only. The restricted role gets UPDATE on lifecycle and
-- published_at columns, never UPDATE on author, parent ID, or version content.
CREATE POLICY survey_publisher_update ON education_v30.survey_versions FOR UPDATE
 USING (lifecycle='draft' AND EXISTS(
   SELECT 1 FROM education_v30.survey_definitions d WHERE d.id=survey_id
     AND education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_publisher')))
 WITH CHECK (lifecycle='published' AND published_at IS NOT NULL AND EXISTS(
   SELECT 1 FROM education_v30.survey_definitions d WHERE d.id=survey_id
     AND education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_publisher')));

CREATE POLICY survey_approval_audit_insert ON education_v30.audit_events FOR INSERT WITH CHECK (
 event_code IN ('survey.review.recorded','survey.version.published') AND
 entity_kind='survey_version' AND
 ((event_code='survey.review.recorded' AND
   education_v30.v28_role_can_access_org(owning_organization_id,'survey_reviewer'))
 OR (event_code='survey.version.published' AND
   education_v30.v28_role_can_access_org(owning_organization_id,'survey_publisher'))));
CREATE POLICY survey_approval_domain_insert ON education_v30.domain_events FOR INSERT WITH CHECK (
 ((event_type='SurveyReviewRecorded' AND aggregate_type='survey_version')
   OR (event_type='SurveyVersionPublished' AND aggregate_type='survey_version'))
 AND EXISTS(SELECT 1 FROM education_v30.survey_versions v
 JOIN education_v30.survey_definitions d ON d.id=v.survey_id
 WHERE v.id=aggregate_id AND
 ((event_type='SurveyReviewRecorded' AND
   education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_reviewer'))
  OR (event_type='SurveyVersionPublished' AND
   education_v30.v28_role_can_access_org(d.owner_organization_id,'survey_publisher')))));

-- Even direct SQL cannot have the author independently approve their own work.
CREATE OR REPLACE FUNCTION education_v30.v301_validate_survey_review() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $survey_review$
DECLARE version_author uuid; version_lifecycle text;
BEGIN
 SELECT author_person_id,lifecycle INTO version_author,version_lifecycle
 FROM survey_versions WHERE id=NEW.survey_version_id FOR SHARE;
 IF version_author IS NULL OR version_lifecycle<>'draft' THEN
  RAISE EXCEPTION 'Independent review requires a draft version';
 END IF;
 IF NEW.reviewer_person_id=version_author THEN
  RAISE EXCEPTION 'Survey authors cannot review their own versions';
 END IF;
 RETURN NEW;
END $survey_review$;
DROP TRIGGER IF EXISTS survey_independent_review_gate ON education_v30.survey_version_reviews;
CREATE TRIGGER survey_independent_review_gate
 BEFORE INSERT ON education_v30.survey_version_reviews
 FOR EACH ROW EXECUTE FUNCTION education_v30.v301_validate_survey_review();

COMMIT;
-- This patch grants no app access and does not enable runtime feature flags.
