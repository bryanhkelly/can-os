-- V6.1 Blueprint legacy journal cutover: use existing public audit/event tables.
-- This migration is additive and grants no broad audit/outbox table access.
-- Restricted native author/reviewer roles must be provisioned separately under
-- the organization's approved database-role binding.
--
-- The caller must have selected an exact role through SET LOCAL ROLE. The
-- SECURITY DEFINER gateway independently verifies purpose, Organization,
-- action pairing, and source entity ownership before the two atomic inserts.

CREATE FUNCTION public.has_restricted_blueprint_purpose(
  p_organization_id uuid, p_purpose text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $purpose$
  SELECT p_purpose IN ('blueprint_author','blueprint_reviewer')
    AND current_setting('role',true) IS NOT NULL
    AND current_setting('role',true) NOT IN ('','none')
    AND current_setting('role',true) =
      'can_v30_' || p_purpose || '_' || replace(p_organization_id::text,'-','')
    AND EXISTS (
      SELECT 1 FROM public.database_role_organization_bindings b
      WHERE b.db_role=current_setting('role',true)::name
        AND b.organization_id=p_organization_id
        AND b.purpose_code=p_purpose
        AND b.status='approved'
        AND b.valid_from<=clock_timestamp()
        AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp())
    );
$purpose$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.has_restricted_blueprint_purpose(uuid,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.has_restricted_blueprint_purpose(uuid,text) TO PUBLIC;
--> statement-breakpoint

CREATE FUNCTION public.append_restricted_blueprint_transition(
  p_action text, p_resource_type text, p_resource_id uuid,
  p_actor_person_id uuid, p_organization_id uuid, p_audit_payload jsonb,
  p_event_type text, p_aggregate_type text, p_aggregate_id uuid,
  p_event_payload jsonb
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $append$
DECLARE
  purpose text;
  expected_event text;
BEGIN
  IF p_actor_person_id IS NULL OR p_organization_id IS NULL
     OR p_resource_id IS NULL OR p_aggregate_id IS DISTINCT FROM p_resource_id
     OR jsonb_typeof(p_audit_payload) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_event_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'Invalid Blueprint journal scope' USING ERRCODE='42501';
  END IF;

  CASE p_action
    WHEN 'blueprint.configuration.created' THEN
      purpose:='blueprint_author'; expected_event:='BlueprintConfigurationCreated';
    WHEN 'blueprint.configuration.saved' THEN
      purpose:='blueprint_author'; expected_event:='BlueprintConfigurationSaved';
    WHEN 'blueprint.configuration.submitted' THEN
      purpose:='blueprint_author'; expected_event:='BlueprintConfigurationSubmitted';
    WHEN 'blueprint.configuration.reviewed' THEN
      purpose:='blueprint_reviewer'; expected_event:='BlueprintConfigurationReviewed';
    WHEN 'blueprint.configuration.executed' THEN
      purpose:='blueprint_author'; expected_event:='BlueprintConfigurationExecuted';
    ELSE
      RAISE EXCEPTION 'Unrecognized Blueprint journal action' USING ERRCODE='42501';
  END CASE;

  IF NOT public.has_restricted_blueprint_purpose(p_organization_id,purpose)
     OR p_event_type IS DISTINCT FROM expected_event
  THEN
    RAISE EXCEPTION 'Restricted Blueprint journal purpose or event mismatch'
      USING ERRCODE='42501';
  END IF;

  IF p_action='blueprint.configuration.executed' THEN
    IF p_resource_type IS DISTINCT FROM 'blueprint_execution_batch'
       OR p_aggregate_type IS DISTINCT FROM 'BlueprintExecutionBatch'
       OR p_event_payload->>'organizationId' IS DISTINCT FROM p_organization_id::text
       OR NOT EXISTS (
         SELECT 1 FROM public.blueprint_execution_batches batch
         JOIN public.blueprint_configuration_versions v
           ON v.id=batch.configuration_version_id
         JOIN public.blueprint_configurations cfg
           ON cfg.id=v.configuration_id
         WHERE batch.id=p_resource_id
           AND batch.executing_organization_id=p_organization_id
           AND cfg.owning_organization_id=p_organization_id
       )
    THEN
      RAISE EXCEPTION 'Blueprint execution journal ownership mismatch'
        USING ERRCODE='42501';
    END IF;
  ELSE
    IF p_resource_type IS DISTINCT FROM 'blueprint_configuration'
       OR p_aggregate_type IS DISTINCT FROM 'blueprint_configuration'
       OR p_event_payload->>'owningOrganizationId' IS DISTINCT FROM p_organization_id::text
       OR NOT EXISTS (
         SELECT 1 FROM public.blueprint_configurations cfg
         WHERE cfg.id=p_resource_id
           AND cfg.owning_organization_id=p_organization_id
       )
    THEN
      RAISE EXCEPTION 'Blueprint configuration journal ownership mismatch'
        USING ERRCODE='42501';
    END IF;
  END IF;

  INSERT INTO public.audit_events
    (actor_person_id,action,resource_type,resource_id,scope,context)
  VALUES
    (p_actor_person_id,p_action,p_resource_type,p_resource_id,
     jsonb_build_object('organizationId',p_organization_id),
     jsonb_build_object('source','canonical_v301','nativeAuditPayload',p_audit_payload));

  INSERT INTO public.domain_events
    (event_type,aggregate_type,aggregate_id,actor_person_id,payload)
  VALUES
    (p_event_type,p_aggregate_type,p_aggregate_id,p_actor_person_id,p_event_payload);
END;
$append$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.append_restricted_blueprint_transition(
  text,text,uuid,uuid,uuid,jsonb,text,text,uuid,jsonb
) FROM PUBLIC;
--> statement-breakpoint

-- Preserve the independent reviewer requirement without allowing general
-- audit-history SELECT. The restricted reviewer receives only three columns
-- in the separate Organization provisioning script.
CREATE POLICY blueprint_author_history_reviewer_read
  ON public.audit_events AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (
    action IN (
      'blueprint.configuration.created',
      'blueprint.configuration.saved',
      'blueprint.configuration.submitted'
    )
    AND resource_type='blueprint_configuration'
    AND EXISTS (
      SELECT 1 FROM public.blueprint_configurations cfg
      WHERE cfg.id=resource_id
        AND cfg.owning_organization_id::text=scope->>'organizationId'
        AND public.has_restricted_blueprint_purpose(
          cfg.owning_organization_id,'blueprint_reviewer')
    )
  );
