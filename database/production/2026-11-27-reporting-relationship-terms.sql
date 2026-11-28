-- Apply after 2026-11-24-bottom-up-reporting-relationships.sql.
-- Validate in an isolated database before production; no source record backfill.
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

ALTER TABLE public.reporting_relationship_agreements
  ADD COLUMN data_population text NOT NULL DEFAULT 'unknown' CHECK (data_population IN ('real','synthetic','unknown')),
  ADD COLUMN coverage_mode text NOT NULL DEFAULT 'prospective',
  ADD COLUMN coverage_from timestamptz,
  ADD COLUMN supersedes_id uuid REFERENCES public.reporting_relationship_agreements(id),
  ADD CONSTRAINT reporting_relationship_coverage_check CHECK (
    (coverage_mode IN ('prospective','all_history') AND coverage_from IS NULL)
    OR (coverage_mode='from_date' AND coverage_from IS NOT NULL AND coverage_from<=proposed_at)),
  ADD CONSTRAINT reporting_relationship_no_self_revision CHECK (supersedes_id IS NULL OR supersedes_id<>id);
-- An accepted tag need not authorize any reporting metric.
ALTER TABLE public.reporting_relationship_agreements
  DROP CONSTRAINT reporting_relationship_agreements_metrics_check,
  ADD CONSTRAINT reporting_relationship_agreements_metrics_check
    CHECK (jsonb_typeof(metrics)='array' AND jsonb_array_length(metrics) BETWEEN 0 AND 50);

-- One pending proposal and one accepted revision may coexist. A replacement
-- is never effective until independently accepted. Preserve all old rows.
CREATE UNIQUE INDEX reporting_relationship_pending_uq ON public.reporting_relationship_agreements
  (owner_organization_id,recipient_organization_id,scope_kind,scope_id,relationship_kind)
  WHERE status='pending';
CREATE UNIQUE INDEX reporting_relationship_accepted_uq ON public.reporting_relationship_agreements
  (owner_organization_id,recipient_organization_id,scope_kind,scope_id,relationship_kind)
  WHERE status='accepted';
CREATE UNIQUE INDEX reporting_relationship_pending_revision_uq ON public.reporting_relationship_agreements
  (supersedes_id) WHERE status='pending' AND supersedes_id IS NOT NULL;
DROP INDEX public.reporting_relationship_live_uq;

-- The original guard still enforces immutable terms, ownership and independent
-- actor transitions. This companion trigger validates revision lineage and
-- terminates the old terms in the SAME transaction as acceptance of the new.
CREATE FUNCTION public.guard_reporting_relationship_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $revision$
DECLARE predecessor public.reporting_relationship_agreements%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND NOT (OLD.status='pending' AND NEW.status='accepted') THEN RETURN NEW; END IF;
  IF NEW.data_population NOT IN ('real','synthetic') THEN RAISE EXCEPTION 'Explicit relationship population required'; END IF;
  SELECT * INTO predecessor FROM public.reporting_relationship_agreements r
    WHERE r.owner_organization_id=NEW.owner_organization_id
      AND r.recipient_organization_id=NEW.recipient_organization_id
      AND r.scope_kind=NEW.scope_kind
      AND r.scope_id=coalesce(NEW.site_id,NEW.program_id,NEW.offering_id,NEW.class_id,NEW.owner_organization_id)
      AND r.relationship_kind=NEW.relationship_kind
      AND r.status='accepted'
    FOR UPDATE;
  IF NEW.supersedes_id IS NULL THEN
    IF FOUND THEN RAISE EXCEPTION 'Existing accepted terms require an explicit amendment'; END IF;
  ELSE
    IF NOT FOUND OR predecessor.id<>NEW.supersedes_id OR predecessor.data_population<>NEW.data_population THEN
      RAISE EXCEPTION 'Amendment must reference the current accepted agreement with identical parties, kind and scope';
    END IF;
    IF TG_OP='UPDATE' THEN
      UPDATE public.reporting_relationship_agreements
        SET status='revoked',last_action_at=NEW.last_action_at,
            last_action_by_person_id=NEW.last_action_by_person_id,
            last_action_organization_id=NEW.last_action_organization_id
        WHERE id=predecessor.id AND status='accepted';
      IF NOT FOUND THEN RAISE EXCEPTION 'Prior terms no longer current'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $revision$;
CREATE TRIGGER reporting_relationship_revision_guard
  BEFORE INSERT OR UPDATE ON public.reporting_relationship_agreements
  FOR EACH ROW EXECUTE FUNCTION public.guard_reporting_relationship_revision();
REVOKE ALL ON FUNCTION public.guard_reporting_relationship_revision() FROM PUBLIC,anonymous,authenticated;
COMMIT;
