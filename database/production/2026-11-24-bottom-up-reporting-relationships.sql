-- Source migration only: do not deploy application readers ahead of reviewed
-- role assignments, aggregate disclosure policy and exact-SHA acceptance.
-- These scoped consent agreements are NOT legacy host-wide reporting grants.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
     OR current_database()<>'neondb' OR current_user<>'neondb_owner'
  THEN RAISE EXCEPTION 'Expected authorized CAN OS main owner'; END IF;
END $guard$;

CREATE TABLE public.reporting_relationship_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_organization_id uuid NOT NULL REFERENCES public.organizations(id),
  recipient_organization_id uuid NOT NULL REFERENCES public.organizations(id),
  scope_kind text NOT NULL CHECK (scope_kind IN ('organization','site','program','offering','class')),
  site_id uuid REFERENCES public.sites(id),
  program_id uuid REFERENCES public.programs(id),
  offering_id uuid REFERENCES public.offerings(id),
  class_id uuid REFERENCES public.classes(id),
  scope_id uuid GENERATED ALWAYS AS
    (coalesce(site_id,program_id,offering_id,class_id,owner_organization_id)) STORED,
  relationship_kind text NOT NULL CHECK (relationship_kind IN
    ('affiliation','sponsorship','funding','provider','host','accreditation','endorsement','operator','partnership')),
  metrics jsonb NOT NULL CHECK (jsonb_typeof(metrics)='array' AND jsonb_array_length(metrics) BETWEEN 1 AND 50),
  valid_through timestamptz,
  proposed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  proposed_by_person_id uuid NOT NULL REFERENCES public.people(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','withdrawn','revoked')),
  accepted_at timestamptz,
  accepted_by_person_id uuid REFERENCES public.people(id),
  last_action_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_action_by_person_id uuid NOT NULL REFERENCES public.people(id),
  last_action_organization_id uuid NOT NULL REFERENCES public.organizations(id),
  CHECK (owner_organization_id<>recipient_organization_id),
  CHECK (valid_through IS NULL OR valid_through>proposed_at),
  CHECK (last_action_at>=proposed_at),
  CHECK ((scope_kind='organization' AND num_nonnulls(site_id,program_id,offering_id,class_id)=0)
    OR (num_nonnulls(site_id,program_id,offering_id,class_id)=1 AND
      ((scope_kind='site' AND site_id IS NOT NULL) OR (scope_kind='program' AND program_id IS NOT NULL)
       OR (scope_kind='offering' AND offering_id IS NOT NULL) OR (scope_kind='class' AND class_id IS NOT NULL)))),
  CHECK ((status IN ('accepted','revoked') AND accepted_at IS NOT NULL AND accepted_by_person_id IS NOT NULL
    AND accepted_by_person_id<>proposed_by_person_id AND accepted_at>=proposed_at
    AND accepted_at<=last_action_at AND (valid_through IS NULL OR accepted_at<valid_through))
    OR (status IN ('pending','declined','withdrawn') AND accepted_at IS NULL AND accepted_by_person_id IS NULL))
);
CREATE INDEX reporting_relationship_recipient_idx ON public.reporting_relationship_agreements
  (recipient_organization_id,status,owner_organization_id,scope_kind,scope_id);
CREATE INDEX reporting_relationship_owner_idx ON public.reporting_relationship_agreements
  (owner_organization_id,status,scope_kind,scope_id);
-- Prevent duplicate live relationships; expired agreements can be explicitly
-- withdrawn or revoked before re-proposal. No silent broadening or replacement.
CREATE UNIQUE INDEX reporting_relationship_live_uq ON public.reporting_relationship_agreements
  (owner_organization_id,recipient_organization_id,scope_kind,scope_id,relationship_kind)
  WHERE status IN ('pending','accepted');

CREATE TABLE public.reporting_relationship_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.reporting_relationship_agreements(id),
  status text NOT NULL CHECK (status IN ('pending','accepted','declined','withdrawn','revoked')),
  actor_person_id uuid NOT NULL REFERENCES public.people(id),
  actor_organization_id uuid NOT NULL REFERENCES public.organizations(id),
  occurred_at timestamptz NOT NULL,
  UNIQUE (agreement_id,status)
);
ALTER TABLE public.reporting_relationship_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_relationship_agreements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_relationship_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_relationship_events FORCE ROW LEVEL SECURITY;
CREATE POLICY reporting_relationship_owner_only ON public.reporting_relationship_agreements
  FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
CREATE POLICY reporting_relationship_events_owner_only ON public.reporting_relationship_events
  FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
REVOKE ALL ON public.reporting_relationship_agreements,public.reporting_relationship_events FROM PUBLIC,anonymous,authenticated;

-- An Offering is a shared catalog product. Its publisher and independently
-- approved local operators can each consent for their own source records.
CREATE FUNCTION public.reporting_relationship_offering_owner(p_offering uuid,p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $
  SELECT EXISTS (
    SELECT 1 FROM public.offerings o
    WHERE o.id=p_offering AND o.status='active' AND (
      o.publisher_organization_id=p_owner OR EXISTS (
        SELECT 1 FROM public.program_deployments pd
        JOIN public.education_operations op ON op.id=pd.operation_id AND op.status='active'
        JOIN public.education_operation_organization_roles r ON r.operation_id=op.id
          AND r.organization_id=p_owner AND r.role_code='operator' AND r.status='approved'
          AND r.valid_from<=CURRENT_TIMESTAMP
          AND (r.valid_through IS NULL OR r.valid_through>CURRENT_TIMESTAMP)
        JOIN public.deployment_offering_adoptions a ON a.deployment_id=pd.id
          AND a.offering_id=o.id AND a.approval_status='approved'
          AND a.valid_from<=CURRENT_TIMESTAMP
          AND (a.valid_through IS NULL OR a.valid_through>CURRENT_TIMESTAMP)
        JOIN public.offering_versions v ON v.id=a.offering_version_id AND v.offering_id=o.id
          AND v.lifecycle='published' AND v.published_at IS NOT NULL
        WHERE pd.offering_id=o.id AND pd.status='active'
      )
    )
  );
$;
REVOKE ALL ON FUNCTION public.reporting_relationship_offering_owner(uuid,uuid) FROM PUBLIC,anonymous,authenticated;

-- Structural checks are defense in depth. The application must independently
-- authenticate the actor and authorize each action; UUIDs are not credentials.
CREATE FUNCTION public.guard_reporting_relationship_agreement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE actual_owner uuid; metric_count int;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Relationship agreement history cannot be deleted'; END IF;
  IF NEW.scope_kind='organization' THEN actual_owner:=NEW.owner_organization_id;
  ELSIF NEW.scope_kind='site' THEN SELECT organization_id INTO actual_owner FROM public.sites WHERE id=NEW.site_id FOR SHARE;
  ELSIF NEW.scope_kind='program' THEN SELECT organization_id INTO actual_owner FROM public.programs WHERE id=NEW.program_id FOR SHARE;
  ELSIF NEW.scope_kind='offering' THEN
    IF public.reporting_relationship_offering_owner(NEW.offering_id,NEW.owner_organization_id)
    THEN actual_owner:=NEW.owner_organization_id; END IF;
  ELSIF NEW.scope_kind='class' THEN SELECT operating_organization_id INTO actual_owner FROM public.classes WHERE id=NEW.class_id FOR SHARE;
  END IF;
  IF actual_owner IS DISTINCT FROM NEW.owner_organization_id AND
    (TG_OP='INSERT' OR NEW.status NOT IN ('withdrawn','revoked'))
  THEN RAISE EXCEPTION 'Relationship source owner mismatch'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=NEW.owner_organization_id AND lifecycle_status='active')
      OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=NEW.recipient_organization_id AND lifecycle_status='active')
      OR NEW.status<>'pending' OR NEW.last_action_organization_id<>NEW.owner_organization_id
      OR NEW.last_action_by_person_id<>NEW.proposed_by_person_id
      OR NEW.last_action_at<>NEW.proposed_at OR NEW.proposed_at>CURRENT_TIMESTAMP
    THEN RAISE EXCEPTION 'Owner initiated pending proposal required'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.metrics) AS m
      WHERE jsonb_typeof(m)<>'object' OR jsonb_typeof(m->'metricKey') IS DISTINCT FROM 'string'
      OR jsonb_typeof(m->'definitionVersion') IS DISTINCT FROM 'string'
      OR length(m->>'metricKey') NOT BETWEEN 1 AND 128 OR length(m->>'definitionVersion') NOT BETWEEN 1 AND 64
      OR m - 'metricKey' - 'definitionVersion' <> '{}'::jsonb)
    THEN RAISE EXCEPTION 'Versioned metric references required'; END IF;
    SELECT count(DISTINCT m->>'metricKey') INTO metric_count FROM jsonb_array_elements(NEW.metrics) AS m;
    IF metric_count<>jsonb_array_length(NEW.metrics) THEN RAISE EXCEPTION 'Duplicate relationship metric'; END IF;
  ELSE
    IF (to_jsonb(NEW)-ARRAY['scope_id','status','accepted_at','accepted_by_person_id','last_action_at',
          'last_action_by_person_id','last_action_organization_id']) <>
       (to_jsonb(OLD)-ARRAY['scope_id','status','accepted_at','accepted_by_person_id','last_action_at',
          'last_action_by_person_id','last_action_organization_id'])
       OR NEW.last_action_at<OLD.last_action_at OR NEW.last_action_at>CURRENT_TIMESTAMP
    THEN RAISE EXCEPTION 'Relationship terms are immutable'; END IF;
    IF OLD.status='pending' AND NEW.status IN ('accepted','declined') THEN
      IF NEW.last_action_organization_id<>OLD.recipient_organization_id
        OR NEW.last_action_by_person_id=OLD.proposed_by_person_id
        OR (OLD.valid_through IS NOT NULL AND OLD.valid_through<=CURRENT_TIMESTAMP)
        OR (NEW.status='accepted' AND (NEW.accepted_at IS DISTINCT FROM NEW.last_action_at
          OR NEW.accepted_by_person_id IS DISTINCT FROM NEW.last_action_by_person_id))
      THEN RAISE EXCEPTION 'Independent recipient decision required'; END IF;
    ELSIF OLD.status='pending' AND NEW.status='withdrawn' THEN
      IF NEW.last_action_organization_id<>OLD.owner_organization_id THEN RAISE EXCEPTION 'Owner withdrawal required'; END IF;
    ELSIF OLD.status='accepted' AND NEW.status='revoked' THEN
      IF NEW.last_action_organization_id NOT IN (OLD.owner_organization_id,OLD.recipient_organization_id)
        OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.accepted_by_person_id IS DISTINCT FROM OLD.accepted_by_person_id
      THEN RAISE EXCEPTION 'Existing party revocation required'; END IF;
    ELSE RAISE EXCEPTION 'Invalid relationship lifecycle transition';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reporting_relationship_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.reporting_relationship_agreements FOR EACH ROW EXECUTE FUNCTION public.guard_reporting_relationship_agreement();

CREATE FUNCTION public.record_reporting_relationship_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  INSERT INTO public.reporting_relationship_events
    (agreement_id,status,actor_person_id,actor_organization_id,occurred_at)
  VALUES (NEW.id,NEW.status,NEW.last_action_by_person_id,NEW.last_action_organization_id,NEW.last_action_at);
  RETURN NEW;
END $$;
CREATE TRIGGER reporting_relationship_audit AFTER INSERT OR UPDATE ON public.reporting_relationship_agreements
  FOR EACH ROW EXECUTE FUNCTION public.record_reporting_relationship_event();

CREATE FUNCTION public.prevent_reporting_relationship_event_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'Relationship events are append-only';
END $$;
CREATE TRIGGER reporting_relationship_events_immutable BEFORE UPDATE OR DELETE
  ON public.reporting_relationship_events FOR EACH ROW EXECUTE FUNCTION public.prevent_reporting_relationship_event_mutation();

COMMIT;
