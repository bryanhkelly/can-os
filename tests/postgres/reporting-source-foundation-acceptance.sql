-- Read-only acceptance assertions for exact migrations 0100 and 0101.
-- The workflow executes these ONLY against its disposable PostgreSQL service.
-- Never interpret this as production/Neon role-isolation certification.
DO $reporting_acceptance$
DECLARE
  relation_name text;
  index_name text;
  constraint_name text;
  trigger_name text;
  role_name text;
  guarded boolean;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'reporting_source_event_receipts',
    'reporting_source_snapshots',
    'reporting_source_snapshot_events'
  ] LOOP
    SELECT c.relrowsecurity AND c.relforcerowsecurity
      INTO guarded
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=relation_name AND c.relkind='r';
    IF NOT COALESCE(guarded,false) THEN
      RAISE EXCEPTION 'Required forced RLS is missing for %.%', 'public', relation_name;
    END IF;
  END LOOP;

  FOREACH index_name IN ARRAY ARRAY[
    'reporting_source_event_receipts_pkey',
    'reporting_source_canonical_revision_uq',
    'reporting_source_site_period_idx',
    'reporting_source_program_period_idx',
    'reporting_source_correction_idx',
    'reporting_source_retry_idx',
    'reporting_source_outbox_scope_period_idx',
    'reporting_source_snapshots_pkey',
    'reporting_source_snapshot_events_pk',
    'reporting_snapshots_scope_time_idx',
    'reporting_snapshot_events_source_idx'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname=index_name
    ) THEN
      RAISE EXCEPTION 'Required reporting index missing: %', index_name;
    END IF;
  END LOOP;

  FOREACH constraint_name IN ARRAY ARRAY[
    'reporting_source_receipt_status_ck',
    'reporting_source_receipt_data_ck',
    'reporting_source_receipt_identity_ck',
    'reporting_source_retry_state_ck',
    'reporting_snapshots_period_ck',
    'reporting_snapshots_count_ck',
    'reporting_snapshots_digest_ck',
    'reporting_snapshots_schema_ck',
    'reporting_snapshot_events_digest_ck',
    'reporting_snapshot_events_version_ck',
    'reporting_source_snapshot_events_pk'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname=constraint_name
      AND connamespace='public'::regnamespace
    ) THEN
      RAISE EXCEPTION 'Required reporting constraint missing: %',constraint_name;
    END IF;
  END LOOP;

  FOREACH trigger_name IN ARRAY ARRAY[
    'guard_reporting_source_receipt_mutation',
    'guard_reporting_source_snapshot_mutation',
    'guard_reporting_source_snapshot_membership_mutation'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname=trigger_name AND NOT tgisinternal AND tgenabled IN ('O','A')
    ) THEN
      RAISE EXCEPTION 'Required reporting immutability trigger missing: %',trigger_name;
    END IF;
  END LOOP;

  -- The restricted role is provisioned but never assigned to a login by
  -- migrations. All three tables keep forced RLS and explicit policy scope.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='can_reporting_service'
    AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolsuper) THEN
    RAISE EXCEPTION 'Missing safe NOLOGIN can_reporting_service';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'reporting_source_event_receipts',
    'reporting_source_snapshots',
    'reporting_source_snapshot_events'
  ] LOOP
    IF NOT has_table_privilege('can_reporting_service',
      'public.'||relation_name,'SELECT') OR
       NOT has_table_privilege('can_reporting_service',
      'public.'||relation_name,'INSERT') THEN
      RAISE EXCEPTION 'Reporting service missing expected table access: %',
        relation_name;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public'
        AND tablename=relation_name
        AND ('{public,anonymous,authenticated}'::text[] && roles::text[])
    ) THEN
      RAISE EXCEPTION 'Reporting policy accidentally grants public access: %',
        relation_name;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('can_reporting_service',
    'public.reporting_source_event_receipts','UPDATE') THEN
    RAISE EXCEPTION 'Reporting service missing retry UPDATE permission';
  END IF;
  IF has_table_privilege('can_reporting_service',
    'public.reporting_source_event_receipts','DELETE')
    OR has_table_privilege('can_reporting_service',
    'public.reporting_source_snapshots','UPDATE')
    OR has_table_privilege('can_reporting_service',
    'public.reporting_source_snapshots','DELETE')
    OR has_table_privilege('can_reporting_service',
    'public.reporting_source_snapshot_events','UPDATE')
    OR has_table_privilege('can_reporting_service',
    'public.reporting_source_snapshot_events','DELETE') THEN
    RAISE EXCEPTION 'Reporting role gained mutable snapshot or DELETE rights';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('reporting_source_event_receipts',
      'reporting_source_snapshots','reporting_source_snapshot_events')
    AND 'can_reporting_service'=ANY(roles)) <> 7 THEN
    RAISE EXCEPTION 'Expected seven restricted reporting service policies';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['anonymous','authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name AND NOT rolcanlogin) THEN
      RAISE EXCEPTION 'Missing disposable NOLOGIN role: %',role_name;
    END IF;
    FOREACH relation_name IN ARRAY ARRAY[
      'reporting_source_event_receipts',
      'reporting_source_snapshots',
      'reporting_source_snapshot_events'
    ] LOOP
      IF has_table_privilege(role_name,'public.'||relation_name,'SELECT')
        OR has_table_privilege(role_name,'public.'||relation_name,'INSERT')
        OR has_table_privilege(role_name,'public.'||relation_name,'UPDATE')
        OR has_table_privilege(role_name,'public.'||relation_name,'DELETE')
      THEN
        RAISE EXCEPTION 'Unprivileged role % has reporting table access to %',
          role_name,relation_name;
      END IF;
    END LOOP;
    IF has_function_privilege(role_name,
      'public.guard_reporting_source_receipt_mutation()','EXECUTE')
      OR has_function_privilege(role_name,
      'public.guard_reporting_source_snapshot_mutation()','EXECUTE') THEN
      RAISE EXCEPTION 'Unprivileged role % can execute reporting trigger helpers',role_name;
    END IF;
  END LOOP;
END;
$reporting_acceptance$;

-- Exercise the positive role through PostgreSQL RLS, not just catalog checks.
SET ROLE can_reporting_service;
SELECT count(*) AS accessible_reporting_receipts FROM public.reporting_source_event_receipts;
SELECT count(*) AS accessible_reporting_snapshots FROM public.reporting_source_snapshots;
SELECT count(*) AS accessible_reporting_members FROM public.reporting_source_snapshot_events;
RESET ROLE;

SELECT 'reporting_source_foundation_acceptance' AS test_name, 'PASS' AS status;
