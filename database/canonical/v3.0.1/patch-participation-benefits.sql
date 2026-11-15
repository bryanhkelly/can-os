-- Recreation membership, class-pack and session-credit persistence.
-- This is the canonical, not-yet-active foundation: no publishing, payment,
-- entitlement issuance or redemption endpoints are authorized by this patch.
-- Requires independent review before applying to ANY database.
BEGIN;
CREATE TABLE IF NOT EXISTS education_v30.participation_benefit_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owning_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 site_id uuid REFERENCES education_v30.sites(id),
 code text NOT NULL,title text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('membership','class_pack','session_credits')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT participation_benefit_product_code_uq UNIQUE(owning_organization_id,code),
 CHECK(length(btrim(code)) BETWEEN 2 AND 80),
 CHECK(length(btrim(title)) BETWEEN 3 AND 200)
);
CREATE TABLE IF NOT EXISTS education_v30.participation_benefit_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES education_v30.participation_benefit_products(id),
 version_no integer NOT NULL CHECK(version_no>=1),
 units_per_term integer CHECK(units_per_term BETWEEN 1 AND 100000),
 term_days integer NOT NULL CHECK(term_days BETWEEN 1 AND 730),
 renewal_months integer CHECK(renewal_months BETWEEN 1 AND 24),
 published_at timestamptz,
 CONSTRAINT participation_benefit_product_version_uq UNIQUE(product_id,version_no),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS education_v30.participation_benefit_entitlements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 benefit_version_id uuid NOT NULL REFERENCES education_v30.participation_benefit_versions(id),
 beneficiary_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 issuing_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 source_kind text NOT NULL CHECK(source_kind IN ('settled_payment','sponsorship','approved_waiver')),
 source_evidence_version_id uuid NOT NULL REFERENCES education_v30.evidence_document_versions(id),
 starts_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','expired','revoked')),
 issued_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 issued_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT participation_benefit_entitlement_window_ck CHECK(expires_at>starts_at)
);
CREATE INDEX IF NOT EXISTS participation_benefit_person_idx
 ON education_v30.participation_benefit_entitlements(beneficiary_person_id,status);
CREATE TABLE IF NOT EXISTS education_v30.participation_benefit_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entitlement_id uuid NOT NULL REFERENCES education_v30.participation_benefit_entitlements(id),
 event_kind text NOT NULL CHECK(event_kind IN ('issue','consume','restore')),
 units integer NOT NULL CHECK(units BETWEEN 1 AND 100000),
 related_registration_id uuid REFERENCES education_v30.noncredit_registrations(id),
 reverses_event_id uuid REFERENCES education_v30.participation_benefit_events(id),
 request_id uuid NOT NULL,
 recorded_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT participation_benefit_event_request_uq UNIQUE(entitlement_id,request_id),
 CHECK (
  (event_kind='issue' AND related_registration_id IS NULL AND reverses_event_id IS NULL)
  OR (event_kind='consume' AND related_registration_id IS NOT NULL AND reverses_event_id IS NULL)
  OR (event_kind='restore' AND related_registration_id IS NOT NULL AND reverses_event_id IS NOT NULL)
 )
);
CREATE INDEX IF NOT EXISTS participation_benefit_event_registration_idx
 ON education_v30.participation_benefit_events(related_registration_id);

CREATE OR REPLACE FUNCTION education_v30.forbid_participation_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Participation credit evidence is immutable' USING ERRCODE='23514';
END $$;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='participation_benefit_event_immutable'
  AND tgrelid='education_v30.participation_benefit_events'::regclass) THEN
  CREATE TRIGGER participation_benefit_event_immutable
   BEFORE UPDATE OR DELETE ON education_v30.participation_benefit_events
   FOR EACH ROW EXECUTE FUNCTION education_v30.forbid_participation_ledger_mutation();
 END IF;
END $$;

DO $$
DECLARE obj text;
BEGIN
 FOREACH obj IN ARRAY ARRAY[
  'participation_benefit_products','participation_benefit_versions',
  'participation_benefit_entitlements','participation_benefit_events'
 ] LOOP
  EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',obj);
  EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',obj);
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
   AND tablename=obj AND policyname=obj||'_owner_only') THEN
    EXECUTE format('CREATE POLICY %I ON education_v30.%I FOR ALL TO neondb_owner USING(true) WITH CHECK(true)',
     obj||'_owner_only',obj);
  END IF;
  EXECUTE format('REVOKE ALL ON education_v30.%I FROM PUBLIC',obj);
 END LOOP;
END $$;
COMMIT;
