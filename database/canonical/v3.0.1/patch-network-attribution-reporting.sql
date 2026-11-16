-- CAN OS canonical network attribution foundations.
-- Apply only AFTER patch-unified-class-offerings.sql,
-- patch-noncredit-self-enrollment.sql and patch-noncredit-site-associated-online.sql.
-- No organization, Site, enrollment, account or Class is auto-created.
-- Requires a reviewed Site for every existing release before enforcement.
BEGIN;

DO $site_preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM education_v30.noncredit_self_enrollment_releases WHERE site_id IS NULL)
     OR EXISTS (SELECT 1 FROM education_v30.noncredit_self_enrollment_claims WHERE site_id IS NULL)
  THEN
    RAISE EXCEPTION 'Network attribution migration blocked: reconcile all site-less releases and claims against real authorized Sites. Do not silently manufacture a virtual Site.';
  END IF;
END $site_preflight$;

ALTER TABLE education_v30.noncredit_self_enrollment_releases
  DROP CONSTRAINT IF EXISTS noncredit_self_enroll_site_ck;
ALTER TABLE education_v30.noncredit_self_enrollment_releases
  ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE education_v30.noncredit_self_enrollment_claims
  ALTER COLUMN site_id SET NOT NULL;

-- A network unit represents an organizational reporting node, not an operating
-- Site or a separate legal entity. Its reporting parent belongs to the same network.
CREATE TABLE IF NOT EXISTS education_v30.network_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id) ON DELETE RESTRICT,
  parent_unit_id uuid REFERENCES education_v30.network_units(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  unit_kind text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_through timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_units_window_ck CHECK (valid_through IS NULL OR valid_through > valid_from),
  CONSTRAINT network_units_code_uq UNIQUE (network_organization_id,code),
  CONSTRAINT network_units_id_network_uq UNIQUE(id,network_organization_id),
  CONSTRAINT network_units_not_self_parent CHECK (parent_unit_id IS DISTINCT FROM id),
  CONSTRAINT network_units_parent_fk FOREIGN KEY (parent_unit_id,network_organization_id)
    REFERENCES education_v30.network_units(id,network_organization_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS network_units_parent_idx
  ON education_v30.network_units(network_organization_id,parent_unit_id);

CREATE OR REPLACE FUNCTION education_v30.v301_validate_network_unit_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $unit_scope$
BEGIN
  -- Serialize edits within a network to prevent concurrent hierarchy cycles.
  PERFORM pg_advisory_xact_lock(hashtext('network_units:'||NEW.network_organization_id::text));
  IF NEW.parent_unit_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE lineage(id,parent_unit_id,path) AS (
      SELECT id,parent_unit_id,ARRAY[id] FROM network_units WHERE id=NEW.parent_unit_id
      UNION ALL
      SELECT p.id,p.parent_unit_id,lineage.path||p.id
      FROM network_units p JOIN lineage ON p.id=lineage.parent_unit_id
      WHERE NOT p.id=ANY(lineage.path)
    )
    SELECT 1 FROM lineage WHERE id=NEW.id
  ) THEN
    RAISE EXCEPTION 'Network hierarchy cannot contain cycles';
  END IF;
  RETURN NEW;
END $unit_scope$;
DROP TRIGGER IF EXISTS network_unit_parent_guard ON education_v30.network_units;
CREATE TRIGGER network_unit_parent_guard BEFORE INSERT OR UPDATE OF parent_unit_id,network_organization_id
  ON education_v30.network_units FOR EACH ROW
  EXECUTE FUNCTION education_v30.v301_validate_network_unit_parent();

-- Organizational affiliation is independent of physical Site ownership.
-- Membership verification does NOT verify that an individual is a church member.
CREATE TABLE IF NOT EXISTS education_v30.network_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id) ON DELETE RESTRICT,
  member_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id) ON DELETE RESTRICT,
  reporting_unit_id uuid NOT NULL,
  membership_kind text NOT NULL DEFAULT 'affiliate',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','suspended','revoked')),
  valid_from timestamptz NOT NULL,
  valid_through timestamptz,
  evidence_version_id uuid REFERENCES education_v30.evidence_document_versions(id) ON DELETE RESTRICT,
  reviewed_by_person_id uuid REFERENCES education_v30.persons(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_membership_window_ck CHECK(valid_through IS NULL OR valid_through > valid_from),
  CONSTRAINT network_membership_not_self_ck CHECK(network_organization_id <> member_organization_id),
  CONSTRAINT network_membership_approval_ck CHECK(status <> 'approved' OR (reviewed_at IS NOT NULL AND reviewed_by_person_id IS NOT NULL)),
  CONSTRAINT network_membership_unit_fk FOREIGN KEY(reporting_unit_id,network_organization_id)
    REFERENCES education_v30.network_units(id,network_organization_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS network_memberships_member_idx
  ON education_v30.network_memberships(member_organization_id,network_organization_id,status);
CREATE INDEX IF NOT EXISTS network_memberships_unit_idx
  ON education_v30.network_memberships(network_organization_id,reporting_unit_id,status);

CREATE OR REPLACE FUNCTION education_v30.v301_validate_network_membership()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $membership_scope$
BEGIN
  IF NEW.status='approved' THEN
    -- A single credited route per member and network during a given interval.
    -- Multiple different networks are expressly permitted.
    PERFORM pg_advisory_xact_lock(hashtext(
      'network_membership:'||NEW.network_organization_id::text||':'||NEW.member_organization_id::text));
    IF EXISTS (
      SELECT 1 FROM network_memberships m
      WHERE m.id<>NEW.id AND m.status='approved'
        AND m.network_organization_id=NEW.network_organization_id
        AND m.member_organization_id=NEW.member_organization_id
        AND tstzrange(m.valid_from,m.valid_through,'[)') &&
            tstzrange(NEW.valid_from,NEW.valid_through,'[)')
    ) THEN
      RAISE EXCEPTION 'Overlapping approved network membership reporting paths';
    END IF;
  END IF;
  RETURN NEW;
END $membership_scope$;
DROP TRIGGER IF EXISTS network_membership_path_guard ON education_v30.network_memberships;
CREATE TRIGGER network_membership_path_guard
  BEFORE INSERT OR UPDATE ON education_v30.network_memberships
  FOR EACH ROW EXECUTE FUNCTION education_v30.v301_validate_network_membership();

-- A network does not gain individual learner access by accepting an affiliate.
-- This grant is explicitly negotiated with each independent data-owning host.
CREATE TABLE IF NOT EXISTS education_v30.network_reporting_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id) ON DELETE RESTRICT,
  host_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id) ON DELETE RESTRICT,
  allowed_metrics text[] NOT NULL,
  evidence_version_id uuid NOT NULL REFERENCES education_v30.evidence_document_versions(id) ON DELETE RESTRICT,
  granted_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id) ON DELETE RESTRICT,
  valid_from timestamptz NOT NULL,
  valid_through timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_reporting_grant_window_ck CHECK(valid_through IS NULL OR valid_through>valid_from),
  CONSTRAINT network_reporting_grant_metrics_ck CHECK(cardinality(allowed_metrics)>0)
);
CREATE INDEX IF NOT EXISTS network_reporting_grants_scope_idx
  ON education_v30.network_reporting_grants(network_organization_id,host_organization_id,valid_from);

-- Attribution is a governed interpretation of an authoritative registration.
-- No second enrollment, completion, gradebook or attendance record is created.
CREATE TABLE IF NOT EXISTS education_v30.participation_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  noncredit_registration_id uuid UNIQUE REFERENCES education_v30.noncredit_registrations(id) ON DELETE RESTRICT,
  class_enrollment_id uuid UNIQUE REFERENCES education_v30.class_enrollments(id) ON DELETE RESTRICT,
  release_id uuid REFERENCES education_v30.noncredit_self_enrollment_releases(id) ON DELETE RESTRICT,
  delivery_site_id uuid NOT NULL REFERENCES education_v30.sites(id) ON DELETE RESTRICT,
  reporting_site_id uuid NOT NULL REFERENCES education_v30.sites(id) ON DELETE RESTRICT,
  credited_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id) ON DELETE RESTRICT,
  network_membership_id uuid REFERENCES education_v30.network_memberships(id) ON DELETE RESTRICT,
  attribution_basis text NOT NULL DEFAULT 'provider_default'
    CHECK (attribution_basis IN ('provider_default','self_reported','verified_member')),
  relationship_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participation_attribution_source_ck CHECK(
    (noncredit_registration_id IS NOT NULL AND class_enrollment_id IS NULL AND release_id IS NOT NULL)
    OR (noncredit_registration_id IS NULL AND class_enrollment_id IS NOT NULL AND release_id IS NULL)),
  CONSTRAINT participation_attribution_membership_ck CHECK(
    (attribution_basis='provider_default' AND network_membership_id IS NULL)
    OR (attribution_basis IN ('self_reported','verified_member') AND network_membership_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS participation_attribution_credit_idx
  ON education_v30.participation_attributions(credited_organization_id,attributed_at);
CREATE INDEX IF NOT EXISTS participation_attribution_membership_idx
  ON education_v30.participation_attributions(network_membership_id,attributed_at);
CREATE INDEX IF NOT EXISTS participation_attribution_site_idx
  ON education_v30.participation_attributions(reporting_site_id,attributed_at);

CREATE OR REPLACE FUNCTION education_v30.v301_validate_participation_attribution()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $attribution_scope$
DECLARE source_row record;
DECLARE membership_row record;
BEGIN
  IF NEW.noncredit_registration_id IS NOT NULL THEN
    SELECT r.id,r.site_id,r.registering_organization_id,r.status,
           c.registration_id
      INTO source_row
      FROM noncredit_self_enrollment_releases r
      JOIN noncredit_self_enrollment_claims c ON c.release_id=r.id
     WHERE c.registration_id=NEW.noncredit_registration_id
       AND r.id=NEW.release_id;
    IF source_row.id IS NULL OR source_row.site_id IS DISTINCT FROM NEW.delivery_site_id THEN
      RAISE EXCEPTION 'Attribution must reference the registered release and its authorized Site';
    END IF;
  ELSE
    SELECT cl.id,cl.site_id,cl.operating_organization_id
      INTO source_row
      FROM class_enrollments ce JOIN classes cl ON cl.id=ce.class_id
     WHERE ce.id=NEW.class_enrollment_id;
    IF source_row.id IS NULL OR source_row.site_id IS NULL
       OR source_row.site_id IS DISTINCT FROM NEW.delivery_site_id THEN
      RAISE EXCEPTION 'Class enrollment attribution requires its actual Site';
    END IF;
  END IF;

  IF NEW.attribution_basis='provider_default' THEN
    IF NEW.credited_organization_id IS DISTINCT FROM
       COALESCE(source_row.registering_organization_id,source_row.operating_organization_id)
       OR NEW.reporting_site_id IS DISTINCT FROM NEW.delivery_site_id THEN
      RAISE EXCEPTION 'Default attribution must credit its operating Organization and Site';
    END IF;
  ELSE
    SELECT * INTO membership_row
      FROM network_memberships WHERE id=NEW.network_membership_id
        AND status='approved' AND valid_from<=NEW.attributed_at
        AND (valid_through IS NULL OR valid_through>NEW.attributed_at);
    IF membership_row.id IS NULL OR
       membership_row.member_organization_id IS DISTINCT FROM NEW.credited_organization_id THEN
      RAISE EXCEPTION 'Network attribution requires an approved effective membership';
    END IF;
    -- An organization's verified affiliation does not verify a PERSON's membership.
    -- The verified_member basis additionally requires an independent person-proof
    -- workflow and is not writable through the present self-registration service.
  END IF;
  RETURN NEW;
END $attribution_scope$;
DROP TRIGGER IF EXISTS participation_attribution_scope_guard ON education_v30.participation_attributions;
CREATE TRIGGER participation_attribution_scope_guard
  BEFORE INSERT ON education_v30.participation_attributions
  FOR EACH ROW EXECUTE FUNCTION education_v30.v301_validate_participation_attribution();

-- Historical attribution is immutable. Corrections must be represented by an
-- explicit, audited supersession design rather than mutating source evidence.
CREATE OR REPLACE FUNCTION education_v30.v301_freeze_participation_attribution()
RETURNS trigger LANGUAGE plpgsql AS $attribution_freeze$
BEGIN
  RAISE EXCEPTION 'Participation attribution history is immutable';
END $attribution_freeze$;
DROP TRIGGER IF EXISTS participation_attribution_history_guard ON education_v30.participation_attributions;
CREATE TRIGGER participation_attribution_history_guard
  BEFORE UPDATE OR DELETE ON education_v30.participation_attributions
  FOR EACH ROW EXECUTE FUNCTION education_v30.v301_freeze_participation_attribution();

-- Restrict all new tables to the trusted migration owner, not network admins,
-- learners, facilitators or anonymous readers. Services require explicit
-- capability and host-grant checks before returning aggregate projections.
DO $network_rls$
DECLARE table_name text; owner_role text:=current_user;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'network_units','network_memberships','network_reporting_grants','participation_attributions'
  ] LOOP
    EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',table_name);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
        AND tablename=table_name AND policyname='v301_network_trusted_owner_access') THEN
      EXECUTE format(
        'CREATE POLICY v301_network_trusted_owner_access ON education_v30.%I FOR ALL TO %I USING (true) WITH CHECK (true)',
        table_name,owner_role);
    END IF;
  END LOOP;
END $network_rls$;
COMMIT;
