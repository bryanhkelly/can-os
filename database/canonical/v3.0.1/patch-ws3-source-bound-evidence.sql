-- WS3 additive proposal, NOT approved to apply to production.
-- Requires canonical v3.0.1, network attribution, and credential patches.
-- Applying this SQL requires WS00 shared migration-order and restricted-role review.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;

-- An independently reviewed, immutable target binding is required before a
-- generic evidence document may justify a specific learner decision or award.
-- This is a governance reference, NOT a new completion or credential ledger.
CREATE TABLE IF NOT EXISTS education_v30.learning_completion_evidence_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('completion_correction','award_revocation')),
  evidence_version_id uuid NOT NULL REFERENCES education_v30.evidence_document_versions(id),
  noncredit_registration_id uuid REFERENCES education_v30.noncredit_registrations(id),
  award_issuance_id uuid REFERENCES education_v30.learning_award_issuances(id),
  participant_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
  provider_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
  delivery_site_id uuid NOT NULL REFERENCES education_v30.sites(id),
  submitted_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
  approved_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ws3_evidence_exact_subject CHECK (
    (purpose='completion_correction' AND noncredit_registration_id IS NOT NULL AND award_issuance_id IS NULL)
    OR
    (purpose='award_revocation' AND award_issuance_id IS NOT NULL AND noncredit_registration_id IS NULL)
  ),
  CONSTRAINT ws3_evidence_independent_review CHECK (
    submitted_by_person_id<>approved_by_person_id
    AND participant_person_id<>approved_by_person_id
    AND participant_person_id<>submitted_by_person_id
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ws3_evidence_registration_version_uq
 ON education_v30.learning_completion_evidence_bindings
 (noncredit_registration_id,evidence_version_id,purpose)
 WHERE noncredit_registration_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ws3_evidence_award_version_uq
 ON education_v30.learning_completion_evidence_bindings
 (award_issuance_id,evidence_version_id,purpose)
 WHERE award_issuance_id IS NOT NULL;

-- Cross-check the immutable target, Person and original Site attribution.
-- A network membership, reporting Site or general provider-owned document is
-- insufficient. No binding can be backdated or subsequently reassigned.
CREATE OR REPLACE FUNCTION education_v30.ws3_guard_completion_evidence_binding()
RETURNS trigger LANGUAGE plpgsql
SET search_path=education_v30,pg_catalog AS $$
DECLARE target_person uuid; target_org uuid; target_site uuid;
        ev record; today date;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'WS3 reviewed evidence bindings are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.approved_at>clock_timestamp() OR NEW.approved_at<NEW.created_at THEN
    RAISE EXCEPTION 'Evidence binding approval time invalid' USING ERRCODE='23514';
  END IF;
  IF NEW.purpose='completion_correction' THEN
    SELECT r.participant_person_id,t.provider_organization_id,a.delivery_site_id
      INTO target_person,target_org,target_site
    FROM education_v30.noncredit_registrations r
    JOIN education_v30.noncredit_training_versions t ON t.id=r.training_version_id
    JOIN education_v30.participation_attributions a
      ON a.noncredit_registration_id=r.id
    WHERE r.id=NEW.noncredit_registration_id;
  ELSE
    SELECT d.recipient_person_id,i.issuer_organization_id,a.delivery_site_id
      INTO target_person,target_org,target_site
    FROM education_v30.learning_award_issuances i
    JOIN education_v30.learner_achievement_decisions d ON d.id=i.achievement_decision_id
    JOIN education_v30.noncredit_completion_decisions completion
      ON completion.id=d.noncredit_completion_decision_id
    JOIN education_v30.noncredit_registrations r ON r.id=completion.registration_id
    JOIN education_v30.participation_attributions a
      ON a.noncredit_registration_id=r.id
    WHERE i.id=NEW.award_issuance_id;
  END IF;
  IF target_person IS NULL OR target_org IS NULL OR target_site IS NULL OR
     ROW(target_person,target_org,target_site) IS DISTINCT FROM
     ROW(NEW.participant_person_id,NEW.provider_organization_id,NEW.delivery_site_id) THEN
    RAISE EXCEPTION 'WS3 evidence must bind the exact participant, operator and delivery Site'
      USING ERRCODE='23514';
  END IF;

  SELECT v.verified_at,v.verified_by_person_id,v.valid_from,v.valid_through,
         doc.owning_organization_id INTO ev
  FROM education_v30.evidence_document_versions v
  JOIN education_v30.evidence_documents doc ON doc.id=v.document_id
  WHERE v.id=NEW.evidence_version_id;
  today:=clock_timestamp()::date;
  IF ev.owning_organization_id IS DISTINCT FROM target_org OR
     ev.verified_at IS NULL OR ev.verified_at>clock_timestamp() OR
     ev.verified_by_person_id IS NULL OR
     ev.verified_by_person_id IN (NEW.participant_person_id,NEW.submitted_by_person_id) OR
     (ev.valid_from IS NOT NULL AND ev.valid_from>today) OR
     (ev.valid_through IS NOT NULL AND ev.valid_through<today) THEN
    RAISE EXCEPTION 'WS3 evidence not independently verified for the source'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ws3_completion_evidence_guard_trg
 ON education_v30.learning_completion_evidence_bindings;
CREATE TRIGGER ws3_completion_evidence_guard_trg
 BEFORE INSERT OR UPDATE OR DELETE
 ON education_v30.learning_completion_evidence_bindings
 FOR EACH ROW EXECUTE FUNCTION education_v30.ws3_guard_completion_evidence_binding();

ALTER TABLE education_v30.learning_completion_evidence_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.learning_completion_evidence_bindings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON education_v30.learning_completion_evidence_bindings FROM PUBLIC;
CREATE POLICY ws3_evidence_owner_only ON education_v30.learning_completion_evidence_bindings
 FOR ALL TO neondb_owner USING (true) WITH CHECK (true);

-- No application-role INSERT/UPDATE/DELETE grant. The upstream approved
-- evidence-binding command must be independently designed, tested and gated.
COMMIT;
