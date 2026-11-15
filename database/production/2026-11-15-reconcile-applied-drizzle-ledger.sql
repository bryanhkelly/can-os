-- CAN OS | 2026-11-15 | Neon main | additive reconciliation, NOT schema replay.
-- Production already contains every object from Drizzle 0079..0083.
-- Exact file hashes are SHA-256 of committed SQL AFTER repairing 0081's
-- invalid dollar-quote. Source-based snapshots 0077..0083 have been restored.
-- Use only against the reviewed Neon main branch with ledger at 0078.
-- Does NOT create learner data or copy anything from test01.
BEGIN;
DO $can_prod_ledger_guard$
DECLARE n integer; latest bigint; latest_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(20261115, 79083);
  SELECT count(*),max(created_at) INTO n,latest
    FROM drizzle.__drizzle_migrations;
  SELECT hash INTO latest_hash FROM drizzle.__drizzle_migrations
    ORDER BY id DESC LIMIT 1;
  IF n<>80 OR latest<>1794089701000
     OR latest_hash<>'a31721a02ef49473aabeb73da32b456dfb0e1ac8d87671852781e049cd31fd2f' THEN
    RAISE EXCEPTION 'Refusing ledger reconciliation: expected exactly 80 historic entries ending 0078.';
  END IF;
  IF to_regclass('public.access_session_signals') IS NULL
     OR to_regclass('public.session_device_retention_state') IS NULL
     OR to_regclass('public.access_account_favorite_sites') IS NULL
     OR to_regclass('public.access_account_signups') IS NULL
     OR to_regclass('public.access_site_contact_share_revisions') IS NULL
     OR to_regclass('education_v30.site_device_registrations') IS NULL
     OR to_regclass('education_v30.site_device_policies') IS NULL THEN
    RAISE EXCEPTION 'Refusing migration history backfill: required application objects are missing.';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='access_sessions'
        AND column_name IN ('last_activity_at','client_instance_id',
          'device_category','browser_family','os_family','ip_address',
          'network_observed_at','shared_device'))<>8 THEN
    RAISE EXCEPTION 'Refusing migration history backfill: session evidence columns missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='access_account_favorite_sites'
         AND policyname='account_favorites_own_only')
     OR NOT EXISTS (SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='access_site_contact_share_revisions'
         AND policyname='account_contact_shares_own_only')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint
       WHERE conrelid='education_v30.learning_session_events'::regclass
         AND conname='learning_session_events_evidence_level_ck') THEN
    RAISE EXCEPTION 'Refusing migration history backfill: RLS or evidence constraints missing.';
  END IF;
END $can_prod_ledger_guard$;

-- Additive, performance-only missing provider-status lookup index.
CREATE INDEX IF NOT EXISTS noncredit_self_enroll_provider_idx
  ON education_v30.noncredit_self_enrollment_releases
    (provider_organization_id,status,created_at DESC);

-- Drizzle migration record ids 81..85 correspond to journal idx 79..83.
-- Do not stamp a migration unless the corresponding objects were reviewed.
INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES
 ('38c509fed7a88cff7a3459cd56ee0e17a1735f6e58ef0bf2f0c8d2b462648e5e',1794690000000),
 ('40cb061c0533f062d437aa185a7854245af41b79a502342b26ae5ca8d3f11f54',1794690001000),
 ('3e715bf1e88f7ad10b9d7699caa591e66f075fbfce70cd26e26cd75be511110d',1794690002000),
 ('862147fb3157875cd70b3302ae850a4b2b92b616be4d8ad7b0d5ecc061',1794690003000),
 ('fd6797ba1550ab32e4290dc32077418f13bae865ab95723af13a6b8d149e8828',1794690004000);

DO $can_prod_ledger_postcondition$
BEGIN
 IF (SELECT count(*) FROM drizzle.__drizzle_migrations)<>85
   OR (SELECT max(created_at) FROM drizzle.__drizzle_migrations)<>1794690004000
   OR NOT EXISTS (SELECT 1 FROM pg_indexes
       WHERE schemaname='education_v30'
         AND indexname='noncredit_self_enroll_provider_idx') THEN
    RAISE EXCEPTION 'Aborting reconciliation: postconditions did not hold.';
 END IF;
END $can_prod_ledger_postcondition$;
COMMIT;
