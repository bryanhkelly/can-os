-- CAN OS v3.0.1 additive candidate: unified evidence-backed completion awards.
-- Install ONLY in an isolated canonical v3.0.1 database after independent review.
-- Does not touch degree, academic credit, or the existing noncredit certificate record.
-- No runtime grants or public verification endpoint are included.
BEGIN;
SET LOCAL search_path = education_v30, public;

CREATE TABLE learning_award_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('completion_certificate','digital_badge')),
  source_kind text NOT NULL CHECK (source_kind IN ('noncredit_completion','verified_activity')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuer_organization_id,code)
);
CREATE TABLE learning_award_definition_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES learning_award_definitions(id),
  version_no integer NOT NULL CHECK (version_no>0),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  minimum_verified_minutes integer NOT NULL DEFAULT 0 CHECK (minimum_verified_minutes>=0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','published','retired')),
  created_by_person_id uuid NOT NULL REFERENCES persons(id),
  approved_by_person_id uuid REFERENCES persons(id),
  published_at timestamptz,
  UNIQUE (definition_id,version_no),
  CHECK (lifecycle<>'published' OR (
    approved_by_person_id IS NOT NULL AND published_at IS NOT NULL
    AND approved_by_person_id<>created_by_person_id
  ))
);
CREATE TABLE learner_achievement_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_definition_version_id uuid NOT NULL REFERENCES learning_award_definition_versions(id),
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
CREATE TABLE learning_award_issuances (
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
CREATE INDEX learning_award_issuances_issuer_idx ON learning_award_issuances (issuer_organization_id,issued_at);
CREATE TABLE learning_award_issuance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id uuid NOT NULL REFERENCES learning_award_issuances(id),
  event_kind text NOT NULL CHECK (event_kind IN ('revoked')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
  decided_by_person_id uuid NOT NULL REFERENCES persons(id),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX credential_revoked_once ON learning_award_issuance_events (issuance_id)
  WHERE event_kind='revoked';
CREATE TABLE learning_award_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id uuid NOT NULL REFERENCES learning_award_issuances(id),
  format text NOT NULL CHECK (format IN ('pdf','badge_json','png')),
  artifact_version integer NOT NULL CHECK (artifact_version>0),
  storage_reference text NOT NULL CHECK (length(btrim(storage_reference))>0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuance_id,format,artifact_version)
);
CREATE INDEX learning_award_artifacts_issuance_idx ON learning_award_artifacts (issuance_id);

-- Published definitions are identities, not mutable display labels. Use a
-- new definition/version for a new interpretation or future recognition mode.
CREATE FUNCTION v301_guard_credential_definition() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $
BEGIN
  RAISE EXCEPTION 'Credential definition identity is immutable';
END $;
CREATE TRIGGER credential_definition_immutable BEFORE UPDATE OR DELETE ON learning_award_definitions
  FOR EACH ROW EXECUTE FUNCTION v301_guard_credential_definition();

CREATE FUNCTION v301_guard_credential_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $
BEGIN
  IF TG_OP='DELETE' OR OLD.lifecycle<>'draft'
    THEN RAISE EXCEPTION 'Published or retired credential versions are immutable'; END IF;
  IF (NEW.definition_id,NEW.version_no,NEW.created_by_person_id)
       IS DISTINCT FROM (OLD.definition_id,OLD.version_no,OLD.created_by_person_id)
    THEN RAISE EXCEPTION 'Credential version identity cannot change'; END IF;
  IF NEW.lifecycle='published' THEN
    IF (NEW.title,NEW.description,NEW.minimum_verified_minutes)
         IS DISTINCT FROM (OLD.title,OLD.description,OLD.minimum_verified_minutes)
      THEN RAISE EXCEPTION 'Freeze credential definition before publishing'; END IF;
    IF NEW.approved_by_person_id IS NULL OR NEW.published_at IS NULL
      OR NEW.approved_by_person_id=NEW.created_by_person_id
      THEN RAISE EXCEPTION 'Independent approval required for published credential'; END IF;
  END IF;
  RETURN NEW;
END $;
CREATE TRIGGER credential_version_approval_guard BEFORE UPDATE OR DELETE ON learning_award_definition_versions
  FOR EACH ROW EXECUTE FUNCTION v301_guard_credential_version();

CREATE FUNCTION v301_validate_achievement_award() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE definition record; source_record record; v record;
BEGIN
  SELECT d.kind,d.source_kind,d.issuer_organization_id,version.lifecycle,
         version.minimum_verified_minutes INTO definition
    FROM learning_award_definition_versions version
    JOIN learning_award_definitions d ON d.id=version.definition_id
    WHERE version.id=NEW.credential_definition_version_id;
  IF definition.lifecycle IS DISTINCT FROM 'published'
    THEN RAISE EXCEPTION 'Credential definition is not published'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM canonical_account_grants grant_row
    WHERE grant_row.person_id=NEW.decided_by_person_id
      AND grant_row.organization_id=definition.issuer_organization_id
      AND grant_row.role_code IN ('registrar','site_admin')
      AND grant_row.active AND grant_row.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Award decision requires active issuer staff grant'; END IF;
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
CREATE TRIGGER credential_issuance_evidence BEFORE INSERT ON learning_award_issuances
 FOR EACH ROW EXECUTE FUNCTION v301_validate_credential_issuance();

-- Revocations require independently verified evidence belonging to the issuer.
CREATE FUNCTION v301_validate_credential_revocation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $
DECLARE issuer uuid; evidence record;
BEGIN
  SELECT issuer_organization_id INTO issuer FROM learning_award_issuances
    WHERE id=NEW.issuance_id FOR SHARE;
  IF issuer IS NULL THEN RAISE EXCEPTION 'Unknown credential issuer'; END IF;
  SELECT version.verified_at,version.verified_by_person_id,
         document.owning_organization_id INTO evidence
    FROM evidence_document_versions version
    JOIN evidence_documents document ON document.id=version.document_id
    WHERE version.id=NEW.evidence_version_id;
  IF evidence.verified_at IS NULL OR evidence.verified_by_person_id IS NULL
    OR evidence.owning_organization_id IS DISTINCT FROM issuer
    THEN RAISE EXCEPTION 'Revocation requires verified issuer-owned evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM canonical_account_grants grant_row
    WHERE grant_row.person_id=NEW.decided_by_person_id
      AND grant_row.organization_id=issuer
      AND grant_row.role_code IN ('registrar','site_admin')
      AND grant_row.active AND grant_row.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Only current issuer staff can revoke'; END IF;
  RETURN NEW;
END $;
CREATE TRIGGER credential_revocation_provenance BEFORE INSERT ON learning_award_issuance_events
  FOR EACH ROW EXECUTE FUNCTION v301_validate_credential_revocation();

-- A point-in-time PDF is never authoritative. Re-evaluate source freshness,
-- legacy certificate state, expiry and append-only revocation on each read.
CREATE FUNCTION v301_credential_is_current(p_issuance_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=education_v30,pg_catalog AS $
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
     AND (issuance.legacy_noncredit_certificate_id IS NULL OR legacy.status='issued')
     AND (decision.noncredit_completion_decision_id IS NULL
       OR (completion.outcome='completed'
         AND NOT EXISTS (SELECT 1 FROM noncredit_completion_decisions newer
           WHERE newer.supersedes_id=completion.id)))
 );
$;

-- Award evidence and issued artifacts are append-only; a revocation is an event.
CREATE TRIGGER achievement_decisions_immutable BEFORE UPDATE OR DELETE ON learner_achievement_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER learning_award_issuances_immutable BEFORE UPDATE OR DELETE ON learning_award_issuances
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER learning_award_issuance_events_immutable BEFORE UPDATE OR DELETE ON learning_award_issuance_events
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER learning_award_artifacts_immutable BEFORE UPDATE OR DELETE ON learning_award_artifacts
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();

-- Fail closed: only the applying schema owner can inspect or mutate these
-- new relations. A dedicated scoped issuer role/RLS policy must be audited
-- before wiring application issuance.
DO $policies$
DECLARE table_name text; schema_owner name := current_user;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'learning_award_definitions','learning_award_definition_versions',
    'learner_achievement_decisions','learning_award_issuances',
    'learning_award_issuance_events','learning_award_artifacts'
  ] LOOP
    EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY credential_owner_only ON education_v30.%I TO %I USING (true) WITH CHECK (true)',table_name,schema_owner);
  END LOOP;
END $policies$;
COMMIT;
