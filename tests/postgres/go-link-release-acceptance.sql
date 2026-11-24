-- Disposable PostgreSQL acceptance after the complete journaled SQL chain.
-- This file only inspects catalog evidence. Run on the CI postgres service,
-- never on a live Neon branch or against user data.
DO $go_release$
DECLARE
  relation_name text;
  db_role text;
  is_private boolean;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'public.site_go_links',
    'public.site_go_link_daily_visits',
    'public.engagement_definitions',
    'public.engagement_definition_versions'
  ] LOOP
    IF to_regclass(relation_name) IS NULL THEN
      RAISE EXCEPTION 'Go Link acceptance: missing required table %', relation_name;
    END IF;

    SELECT c.relrowsecurity AND c.relforcerowsecurity INTO is_private
    FROM pg_class c WHERE c.oid = to_regclass(relation_name);
    IF NOT COALESCE(is_private, false) THEN
      RAISE EXCEPTION 'Go Link acceptance: missing enforced RLS on %', relation_name;
    END IF;

    FOREACH db_role IN ARRAY ARRAY['anonymous', 'authenticated'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = db_role) THEN
        RAISE EXCEPTION 'Go Link acceptance: missing fixture role %', db_role;
      END IF;
      IF has_table_privilege(db_role, relation_name, 'SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'Go Link acceptance: client role % has direct table privileges on %',
          db_role, relation_name;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='site_go_links'
      AND indexname='site_go_links_code_uq'
      AND indexdef ILIKE '%UNIQUE INDEX%'
  ) THEN
    RAISE EXCEPTION 'Go Link acceptance: missing unique opaque code index';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='site_go_link_daily_visits'
      AND indexname='site_go_link_daily_visits_day_uq'
  ) THEN
    RAISE EXCEPTION 'Go Link acceptance: missing per-day count uniqueness';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='site_go_links'
      AND indexname='site_go_links_request_uq'
      AND indexdef ILIKE '%UNIQUE INDEX%'
  ) THEN
    RAISE EXCEPTION 'Go Link acceptance: missing retry idempotency index';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='site_go_links'
      AND indexname='site_go_links_site_page_idx'
  ) THEN
    RAISE EXCEPTION 'Go Link acceptance: missing Site pagination index';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid='public.site_go_links'::regclass
      AND attname='package_id' AND NOT attisdropped AND attnotnull
  ) THEN
    RAISE EXCEPTION 'Go Link acceptance: direct Site links still require a marketing package';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.site_go_links'::regclass
      AND conname='site_go_links_status_ck'
      AND pg_get_constraintdef(oid) ILIKE '%paused%'
  ) THEN
    RAISE EXCEPTION 'Go Link acceptance: paused lifecycle missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.site_go_links'::regclass
      AND conname='site_go_links_resolution_ck'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.site_go_links'::regclass
      AND conname='site_go_links_request_fingerprint_ck'
  ) THEN
    RAISE EXCEPTION 'Go Link acceptance: ownership resolution/idempotency constraints missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.engagement_definition_versions'::regclass
      AND tgname='engagement_versions_immutable_update'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Go Link acceptance: published engagement versions mutable';
  END IF;
END
$go_release$;
SELECT 'PASS: disposable PostgreSQL Go Link schema, privacy and lifecycle' AS result;
