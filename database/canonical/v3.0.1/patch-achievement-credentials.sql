-- CAN OS v3.0.1 additive candidate: unified evidence-backed completion awards.
-- Install ONLY in an isolated canonical v3.0.1 database after independent review.
-- Does not touch degree, academic credit, or the existing noncredit certificate record.
-- No runtime grants or public verification endpoint are included.
BEGIN;
SET LOCAL search_path = education_v30, public;

CREATE TABLE credential_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('completion_certificate','digital_badge')),
  source_kind text NOT NULL CHECK (source_kind IN ('noncredit_completion','verified_activity')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuer_organization_id,code)
);
CREATE TABLE credential_definition_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES credential_definitions(id),
  version_no integer NOT NULL CHECK (version_no>0),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  minimum_verified_minutes integer NOT NULL DEFAULT 0 CHECK (minimum_verified_minutes>=0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','published','retired')),
  approved_by_person_id uuid REFERENCES persons(id),
  published_at timestamptz,
  UNIQUE (definition_id,version_no),
  CHECK (lifecycle<>'published' OR (approved_by_person_id IS NOT NULL AND published_at IS NOT NULL))
);
CREATE TABLE learner_achievement_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_definition_version_id uuid NOT NULL REFERENCES credential_definition_versions(id),
  recipient_person_id uuid NOT NULL REFERENCES persons(id),
  noncredit_completion_decision_id uuid REFERENCES noncredit_completion_decisions(id),
  activity_evidence_version_id uuid REFERENCES evidence_document_versions(id),
  decided_by_person_id uuid NOT NULL REFERENCES persons(id),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (num_nonnulls(noncredit_completion_decision_id,activity_evidence_version_id)=1),
  CHECK (decided_by_person_id<>recipient_person_id)
);
CREATE UNIQUE INDEX achievement_noncredit_once ON learner_achievement_decisions
  (credential_definition_version_id,noncredit_completion_decision_id)
  WHERE noncredit_completion_decision_id IS NOT NULL;
CREATE UNIQUE INDEX achievement_activity_once ON learner_achievement_decisions
  (credential_definition_version_id,recipient_person_id,activity_evidence_version_id)
  WHERE activity_evidence_version_id IS NOT NULL;

-- A noncredit completion certificate still originates in the v3.0.1
-- noncredit_completion_certificates table. The generic registry points to it;
-- it does not silently create a second independent certificate.
CREATE TABLE credential_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_decision_id uuid NOT NULL UNIQUE REFERENCES learner_achievement_decisions(id),
  issuer_organization_id uuid NOT NULL REFERENCES organizations(id),
  legacy_noncredit_certificate_id uuid UNIQUE REFERENCES noncredit_completion_certificates(id),
  credential_reference text NOT NULL UNIQUE CHECK (length(btrim(credential_reference)) BETWEEN 12 AND 160),
  issued_by_person_id uuid NOT NULL REFERENCES persons(id),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at>issued_at)
);
CREATE INDEX credential_issuances_issuer_idx ON credential_issuances (issuer_organization_id,issued_at);
CREATE TABLE credential_issuance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id uuid NOT NULL REFERENCES credential_issuances(id),
  event_kind text NOT NULL CHECK (event_kind IN ('revoked')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
  decided_by_person_id uuid NOT NULL REFERENCES persons(id),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX credential_revoked_once ON credential_issuance_events (issuance_id)
  WHERE event_kind='revoked';
CREATE TABLE credential_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id uuid NOT NULL REFERENCES credential_issuances(id),
  format text NOT NULL CHECK (format IN ('pdf','badge_json','png')),
  artifact_version integer NOT NULL CHECK (artifact_version>0),
  storage_reference text NOT NULL CHECK (length(btrim(storage_reference))>0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuance_id,format,artifact_version)
);
CREATE INDEX credential_artifacts_issuance_idx ON credential_artifacts (issuance_id);

CREATE FUNCTION v301_validate_achievement_award() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE definition record; source_record record; v record;
BEGIN
  SELECT d.kind,d.source_kind,d.issuer_organization_id,version.lifecycle,
         version.minimum_verified_minutes INTO definition
    FROM credential_definition_versions version
    JOIN credential_definitions d ON d.id=version.definition_id
    WHERE version.id=NEW.credential_definition_version_id;
  IF definition.lifecycle IS DISTINCT FROM 'published'
    THEN RAISE EXCEPTION 'Credential definition is not published'; END IF;
  IF NEW.noncredit_completion_decision_id IS NOT NULL THEN
    IF definition.source_kind<>'noncredit_completion'
      THEN RAISE EXCEPTION 'Credential source kind mismatch'; END IF;
    SELECT completion.outcome,reg.participant_person_id,
      training.provider_organization_id INTO source_record
      FROM noncredit_completion_decisions completion
      JOIN noncredit_registrations reg ON reg.id=completion.registration_id
      JOIN noncredit_training_versions training ON training.id=reg.training_version_id
      WHERE completion.id=NEW.noncredit_completion_decision_id
        AND NOT EXISTS (SELECT 1 FROM noncredit_completion_decisions later
          WHERE later.supersedes_id=completion.id);
    IF source_record.outcome IS DISTINCT FROM 'completed'
      OR source_record.participant_person_id IS DISTINCT FROM NEW.recipient_person_id
      OR source_record.provider_organization_id IS DISTINCT FROM definition.issuer_organization_id
      THEN RAISE EXCEPTION 'Award requires current provider-owned completion'; END IF;
  ELSE
    IF definition.source_kind<>'verified_activity'
      THEN RAISE EXCEPTION 'Credential source kind mismatch'; END IF;
    -- The canonical Activity/registration integration is still pending.
    -- A document alone does not attest to a child's registration or attendance.
    -- Disallow activity award inserts until verified session evidence is wired.
    RAISE EXCEPTION 'Verified activity award source is not yet enabled';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_achievement_evidence BEFORE INSERT ON learner_achievement_decisions
  FOR EACH ROW EXECUTE FUNCTION v301_validate_achievement_award();

CREATE FUNCTION v301_validate_credential_issuance() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE award record; legacy record;
BEGIN
  SELECT a.noncredit_completion_decision_id, d.kind,d.source_kind,
         d.issuer_organization_id INTO award
   FROM learner_achievement_decisions a
   JOIN credential_definition_versions v ON v.id=a.credential_definition_version_id
   JOIN credential_definitions d ON d.id=v.definition_id
   WHERE a.id=NEW.achievement_decision_id FOR SHARE OF a;
  IF award.issuer_organization_id IS DISTINCT FROM NEW.issuer_organization_id
    THEN RAISE EXCEPTION 'Credential issuer mismatch'; END IF;
  IF award.source_kind='noncredit_completion' AND award.kind='completion_certificate' THEN
    SELECT decision_id,issuer_organization_id,status INTO legacy
    FROM noncredit_completion_certificates WHERE id=NEW.legacy_noncredit_certificate_id;
    IF legacy.decision_id IS DISTINCT FROM award.noncredit_completion_decision_id
      OR legacy.issuer_organization_id IS DISTINCT FROM NEW.issuer_organization_id
      OR legacy.status IS DISTINCT FROM 'issued'
      THEN RAISE EXCEPTION 'Noncredit certificate must reuse its canonical certificate'; END IF;
  ELSIF NEW.legacy_noncredit_certificate_id IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy certificate is only valid for noncredit completion certificates';
  END IF;
  IF award.noncredit_completion_decision_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM noncredit_completion_decisions newer
    WHERE newer.supersedes_id=award.noncredit_completion_decision_id)
    THEN RAISE EXCEPTION 'Award evidence has been superseded'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_issuance_evidence BEFORE INSERT ON credential_issuances
 FOR EACH ROW EXECUTE FUNCTION v301_validate_credential_issuance();

-- Award evidence and issued artifacts are append-only; a revocation is an event.
CREATE TRIGGER achievement_decisions_immutable BEFORE UPDATE OR DELETE ON learner_achievement_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER credential_issuances_immutable BEFORE UPDATE OR DELETE ON credential_issuances
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER credential_issuance_events_immutable BEFORE UPDATE OR DELETE ON credential_issuance_events
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER credential_artifacts_immutable BEFORE UPDATE OR DELETE ON credential_artifacts
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();

-- Fail closed: only the applying schema owner can inspect or mutate these
-- new relations. A dedicated scoped issuer role/RLS policy must be audited
-- before wiring application issuance.
DO $policies$
DECLARE table_name text; schema_owner name := current_user;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'credential_definitions','credential_definition_versions',
    'learner_achievement_decisions','credential_issuances',
    'credential_issuance_events','credential_artifacts'
  ] LOOP
    EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY credential_owner_only ON education_v30.%I TO %I USING (true) WITH CHECK (true)',table_name,schema_owner);
  END LOOP;
END $policies$;
COMMIT;
