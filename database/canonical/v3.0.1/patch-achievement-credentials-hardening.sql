-- CAN OS v3.0.1: post-install additive learning-award hardening.
-- Run once on databases that installed patch-achievement-credentials.sql before
-- support for SVG and canonical certificate/reference consistency.
-- Updates only the new learning-award domain; no credential issuance is enabled.
BEGIN;
SET LOCAL search_path=education_v30,public;
ALTER TABLE learning_award_artifacts
  DROP CONSTRAINT learning_award_artifacts_format_check;
ALTER TABLE learning_award_artifacts
  ADD CONSTRAINT learning_award_artifacts_format_check
  CHECK (format IN ('pdf','badge_json','png','svg'));

CREATE OR REPLACE FUNCTION v301_validate_credential_issuance() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE award record; legacy record;
BEGIN
  SELECT a.noncredit_completion_decision_id,a.recipient_person_id,d.kind,d.source_kind,
         d.issuer_organization_id INTO award
   FROM learner_achievement_decisions a
   JOIN learning_award_definition_versions v ON v.id=a.credential_definition_version_id
   JOIN learning_award_definitions d ON d.id=v.definition_id
   WHERE a.id=NEW.achievement_decision_id FOR SHARE OF a;
  IF award.issuer_organization_id IS DISTINCT FROM NEW.issuer_organization_id
    THEN RAISE EXCEPTION 'Credential issuer mismatch'; END IF;
  IF NEW.issued_by_person_id=award.recipient_person_id OR NOT EXISTS (
    SELECT 1 FROM canonical_account_grants grant_row
    WHERE grant_row.person_id=NEW.issued_by_person_id
      AND grant_row.organization_id=NEW.issuer_organization_id
      AND grant_row.role_code IN ('registrar','site_admin')
      AND grant_row.active AND grant_row.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Issuance requires active, independent issuer staff'; END IF;
  IF award.source_kind='noncredit_completion' AND award.kind='completion_certificate' THEN
    SELECT decision_id,issuer_organization_id,status,certificate_reference INTO legacy
    FROM noncredit_completion_certificates WHERE id=NEW.legacy_noncredit_certificate_id;
    IF legacy.decision_id IS DISTINCT FROM award.noncredit_completion_decision_id
      OR legacy.issuer_organization_id IS DISTINCT FROM NEW.issuer_organization_id
      OR legacy.status IS DISTINCT FROM 'issued'
      OR legacy.certificate_reference IS DISTINCT FROM NEW.credential_reference
      THEN RAISE EXCEPTION 'Noncredit certificate must reuse its canonical certificate and reference'; END IF;
  ELSIF NEW.legacy_noncredit_certificate_id IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy certificate is only valid for noncredit completion certificates';
  END IF;
  IF award.noncredit_completion_decision_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM noncredit_completion_decisions newer
    WHERE newer.supersedes_id=award.noncredit_completion_decision_id)
    THEN RAISE EXCEPTION 'Award evidence has been superseded'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION v301_credential_is_current(p_issuance_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=education_v30,pg_catalog AS $$
 SELECT EXISTS (
   SELECT 1 FROM learning_award_issuances issuance
   JOIN learner_achievement_decisions decision
     ON decision.id=issuance.achievement_decision_id
   LEFT JOIN noncredit_completion_decisions completion
     ON completion.id=decision.noncredit_completion_decision_id
   LEFT JOIN noncredit_completion_certificates legacy
     ON legacy.id=issuance.legacy_noncredit_certificate_id
   WHERE issuance.id=p_issuance_id
     AND (issuance.expires_at IS NULL OR issuance.expires_at>now())
     AND NOT EXISTS (SELECT 1 FROM learning_award_issuance_events revocation
       WHERE revocation.issuance_id=issuance.id AND revocation.event_kind='revoked')
     AND (issuance.legacy_noncredit_certificate_id IS NULL
       OR (legacy.status='issued' AND legacy.certificate_reference=issuance.credential_reference))
     -- Activity-based awards remain disabled until independent attendance proof exists.
     AND decision.noncredit_completion_decision_id IS NOT NULL
     AND completion.outcome='completed'
     AND NOT EXISTS (SELECT 1 FROM noncredit_completion_decisions newer
       WHERE newer.supersedes_id=completion.id)
 );
$$;
COMMIT;
