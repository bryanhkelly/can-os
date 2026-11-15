-- Additive, opt-in noncredit self-enrollment. No legacy school enrollment or
-- implicit canonical/legacy identity merge. Providers must explicitly publish a
-- release before a learner can register. Review on test01 before production.
BEGIN;

CREATE TABLE IF NOT EXISTS public.access_account_noncredit_principals (
  access_account_id uuid PRIMARY KEY REFERENCES public.access_accounts(id) ON DELETE RESTRICT,
  access_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  canonical_account_id uuid NOT NULL UNIQUE REFERENCES education_v30.canonical_accounts(id) ON DELETE RESTRICT,
  canonical_person_id uuid NOT NULL UNIQUE REFERENCES education_v30.persons(id) ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL DEFAULT now(),
  linkage_method text NOT NULL DEFAULT 'verified_existing_can_session'
    CHECK (linkage_method = 'verified_existing_can_session')
);
ALTER TABLE public.access_account_noncredit_principals ENABLE ROW LEVEL SECURITY;
-- No direct account-to-native link policy. Only server-authenticated,
-- transaction-checked commands may write or read using the trusted app role.

CREATE TABLE IF NOT EXISTS education_v30.noncredit_self_enrollment_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES education_v30.program_deployments(id) ON DELETE RESTRICT,
  adoption_id uuid NOT NULL,
  offering_version_id uuid NOT NULL,
  training_version_id uuid NOT NULL,
  course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id) ON DELETE RESTRICT,
  provider_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id) ON DELETE RESTRICT,
  registering_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id) ON DELETE RESTRICT,
  site_id uuid REFERENCES education_v30.sites(id) ON DELETE RESTRICT,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('independent','facilitated')),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','closed')),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  max_participants integer NOT NULL CHECK (max_participants BETWEEN 1 AND 1000000),
  consent_version text NOT NULL CHECK (char_length(consent_version) BETWEEN 3 AND 80),
  consent_text text NOT NULL CHECK (char_length(consent_text) BETWEEN 25 AND 4000),
  published_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT noncredit_self_enroll_window_ck CHECK (opens_at < closes_at),
  CONSTRAINT noncredit_self_enroll_site_ck CHECK (
    (delivery_mode = 'independent' AND site_id IS NULL) OR
    (delivery_mode = 'facilitated' AND site_id IS NOT NULL)
  ),
  CONSTRAINT noncredit_self_enroll_adoption_fk FOREIGN KEY
    (adoption_id, deployment_id, offering_version_id)
    REFERENCES education_v30.deployment_offering_adoptions(id, deployment_id, offering_version_id)
    ON DELETE RESTRICT,
  CONSTRAINT noncredit_self_enroll_course_fk FOREIGN KEY
    (offering_version_id, course_version_id)
    REFERENCES education_v30.offering_courses(offering_version_id, course_version_id)
    ON DELETE RESTRICT,
  CONSTRAINT noncredit_self_enroll_training_fk FOREIGN KEY
    (training_version_id, offering_version_id)
    REFERENCES education_v30.noncredit_training_versions(id, offering_version_id)
    ON DELETE RESTRICT,
  CONSTRAINT noncredit_self_enroll_close_ck CHECK (
    (status = 'published' AND closed_at IS NULL) OR
    (status = 'closed' AND closed_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS noncredit_self_enroll_published_idx
 ON education_v30.noncredit_self_enrollment_releases(opens_at, closes_at)
 WHERE status='published';
CREATE INDEX IF NOT EXISTS noncredit_self_enroll_registering_idx
 ON education_v30.noncredit_self_enrollment_releases(registering_organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS noncredit_self_enroll_delivery_idx
 ON education_v30.noncredit_self_enrollment_releases(deployment_id,training_version_id,course_version_id);
ALTER TABLE education_v30.noncredit_self_enrollment_releases ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS education_v30.noncredit_self_enrollment_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES education_v30.noncredit_self_enrollment_releases(id) ON DELETE RESTRICT,
  registration_id uuid NOT NULL UNIQUE REFERENCES education_v30.noncredit_registrations(id) ON DELETE RESTRICT,
  participant_person_id uuid NOT NULL REFERENCES education_v30.persons(id) ON DELETE RESTRICT,
  canonical_account_id uuid NOT NULL REFERENCES education_v30.canonical_accounts(id) ON DELETE RESTRICT,
  site_id uuid REFERENCES education_v30.sites(id) ON DELETE RESTRICT,
  consent_version text NOT NULL,
  consent_sha256 text NOT NULL CHECK (consent_sha256 ~ '^[a-f0-9]{64}$'),
  adult_attested boolean NOT NULL CHECK (adult_attested),
  referral_code text CHECK (referral_code IS NULL OR char_length(referral_code) <= 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT noncredit_self_claim_person_release_uq UNIQUE(release_id,participant_person_id)
);
CREATE INDEX IF NOT EXISTS noncredit_self_claim_by_person_idx
 ON education_v30.noncredit_self_enrollment_claims(participant_person_id,created_at DESC);
CREATE INDEX IF NOT EXISTS noncredit_self_claim_capacity_idx
 ON education_v30.noncredit_self_enrollment_claims(release_id);
ALTER TABLE education_v30.noncredit_self_enrollment_claims ENABLE ROW LEVEL SECURITY;

-- Published release attributes cannot be rewritten after participants have
-- seen the consent. Closing is permitted, reopening is not. If a provider
-- changes copy/capacity/curriculum they must publish another release.
CREATE OR REPLACE FUNCTION education_v30.v301_freeze_noncredit_enrollment_release()
RETURNS trigger LANGUAGE plpgsql AS $self_release_immutability$
BEGIN
 IF NEW IS DISTINCT FROM OLD THEN
  IF OLD.status <> 'published' OR NEW.status <> 'closed'
     OR ROW(NEW.deployment_id,NEW.adoption_id,NEW.offering_version_id,
            NEW.training_version_id,NEW.course_version_id,
            NEW.provider_organization_id,NEW.registering_organization_id,
            NEW.site_id,NEW.delivery_mode,NEW.opens_at,NEW.closes_at,
            NEW.max_participants,NEW.consent_version,NEW.consent_text,
            NEW.published_by_person_id,NEW.published_at,NEW.created_at)
        IS DISTINCT FROM
        ROW(OLD.deployment_id,OLD.adoption_id,OLD.offering_version_id,
            OLD.training_version_id,OLD.course_version_id,
            OLD.provider_organization_id,OLD.registering_organization_id,
            OLD.site_id,OLD.delivery_mode,OLD.opens_at,OLD.closes_at,
            OLD.max_participants,OLD.consent_version,OLD.consent_text,
            OLD.published_by_person_id,OLD.published_at,OLD.created_at)
     OR NEW.closed_at IS NULL THEN
    RAISE EXCEPTION 'Published noncredit enrollment release is immutable';
  END IF;
 END IF;
 RETURN NEW;
END $self_release_immutability$;
CREATE TRIGGER v301_freeze_noncredit_release
 BEFORE UPDATE ON education_v30.noncredit_self_enrollment_releases
 FOR EACH ROW EXECUTE FUNCTION education_v30.v301_freeze_noncredit_enrollment_release();

-- A consent claim is evidence. Corrections require a new authorized
-- revision design; an UPDATE or DELETE must not erase prior acceptance.
CREATE OR REPLACE FUNCTION education_v30.v301_freeze_noncredit_enrollment_claim()
RETURNS trigger LANGUAGE plpgsql AS $self_claim_immutability$
BEGIN
 RAISE EXCEPTION 'Noncredit self-enrollment consent claim is immutable';
END $self_claim_immutability$;
CREATE TRIGGER v301_freeze_noncredit_claim
 BEFORE UPDATE OR DELETE ON education_v30.noncredit_self_enrollment_claims
 FOR EACH ROW EXECUTE FUNCTION education_v30.v301_freeze_noncredit_enrollment_claim();

-- The trusted migration owner is explicitly scoped under FORCE RLS.
-- No anonymous, facilitator, native auth-reader, or shared DB login inherits
-- direct SELECT/INSERT/UPDATE/DELETE on enrollment PII or consent records.
DO $self_enrollment_rls$
DECLARE object_name text;
DECLARE object_schema text;
DECLARE trusted_role text := current_user;
BEGIN
  FOR object_schema,object_name IN
    SELECT 'public','access_account_noncredit_principals'
    UNION ALL SELECT 'education_v30','noncredit_self_enrollment_releases'
    UNION ALL SELECT 'education_v30','noncredit_self_enrollment_claims'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',object_schema,object_name);
    IF NOT EXISTS(
      SELECT 1 FROM pg_policies WHERE schemaname=object_schema
        AND tablename=object_name AND policyname='v301_noncredit_trusted_owner_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY v301_noncredit_trusted_owner_access ON %I.%I FOR ALL TO %I USING (true) WITH CHECK (true)',
        object_schema,object_name,trusted_role
      );
    END IF;
  END LOOP;
END $self_enrollment_rls$;

-- A claim cannot associate a learner with a different Person, adoption,
-- Course, Site, training version or operator organization than the registration
-- and immutable enrollment release actually authorize.
ALTER TABLE education_v30.noncredit_self_enrollment_claims
  ADD CONSTRAINT noncredit_self_claim_registration_person_fk
  FOREIGN KEY(registration_id,participant_person_id)
  REFERENCES education_v30.noncredit_registrations(id,participant_person_id);

CREATE OR REPLACE FUNCTION education_v30.v301_validate_noncredit_self_enrollment_claim()
RETURNS trigger LANGUAGE plpgsql
SET search_path=education_v30,pg_catalog AS $self_claim_scope$
DECLARE release_row record;
DECLARE registration_row record;
DECLARE linked_account record;
BEGIN
  SELECT * INTO release_row
  FROM noncredit_self_enrollment_releases
  WHERE id=NEW.release_id;
  SELECT * INTO registration_row
  FROM noncredit_registrations
  WHERE id=NEW.registration_id;
  SELECT * INTO linked_account
  FROM public.access_account_noncredit_principals
  WHERE canonical_account_id=NEW.canonical_account_id
    AND canonical_person_id=NEW.participant_person_id;
  IF release_row.id IS NULL OR registration_row.id IS NULL
     OR linked_account.canonical_account_id IS NULL THEN
    RAISE EXCEPTION 'Self-enrollment requires a verified CAN-to-canonical principal link';
  END IF;
  IF NEW.participant_person_id IS DISTINCT FROM registration_row.participant_person_id
     OR NEW.site_id IS DISTINCT FROM release_row.site_id
     OR NEW.consent_version IS DISTINCT FROM release_row.consent_version
     OR NEW.adult_attested IS DISTINCT FROM true
     OR registration_row.deployment_id IS DISTINCT FROM release_row.deployment_id
     OR registration_row.adoption_id IS DISTINCT FROM release_row.adoption_id
     OR registration_row.offering_version_id IS DISTINCT FROM release_row.offering_version_id
     OR registration_row.training_version_id IS DISTINCT FROM release_row.training_version_id
     OR registration_row.registering_organization_id IS DISTINCT FROM release_row.registering_organization_id THEN
    RAISE EXCEPTION 'Self-enrollment claim must match its approved release and registration';
  END IF;
  RETURN NEW;
END $self_claim_scope$;
CREATE TRIGGER v301_validate_noncredit_self_enrollment_claim
 BEFORE INSERT ON education_v30.noncredit_self_enrollment_claims
 FOR EACH ROW EXECUTE FUNCTION education_v30.v301_validate_noncredit_self_enrollment_claim();

-- Tables are intentionally not globally readable under a learner DB login.
-- Public offering projection and registration use explicit server-side
-- policy/identity guards; existing instructional activity RLS remains intact.
COMMIT;
