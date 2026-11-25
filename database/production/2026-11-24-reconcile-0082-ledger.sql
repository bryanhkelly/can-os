-- Correct the documented November 15 ledger transcription error only.
-- Original ledger insert: database/production/2026-11-15-reconcile-applied-drizzle-ledger.sql.
-- Source: drizzle/0082_personal_can_accounts.sql, unchanged since 4bcb2d8.
-- The original backfill record is retained in Git; this does not replay DDL.
DO $repair$
DECLARE changed integer;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Expected CAN OS Neon main owner'; END IF;
 PERFORM pg_advisory_xact_lock(20261115,79083);
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.access_account_signups'::regclass AND relrowsecurity)
 OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='access_account_signups'
 AND column_name IN ('account_id','first_name','last_name','expires_at','consumed_at','created_at'))<>6
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.access_account_signups'::regclass
 AND conname IN ('access_account_signups_pkey','access_account_signups_account_id_fkey','access_account_signups_first_name_check','access_account_signups_last_name_check','access_account_signups_consumption_after_creation_ck'))<>5
 THEN RAISE EXCEPTION 'Expected 0082 schema evidence absent'; END IF;
 IF (SELECT count(*) FROM drizzle.__drizzle_migrations WHERE created_at=1794690003000)<>1
 THEN RAISE EXCEPTION 'Unexpected migration cardinality'; END IF;
 UPDATE drizzle.__drizzle_migrations SET hash='862147fb3157875cd70b3302ae850a4b2b92b616be4d8ad7b0d5aa50d5ecc061'
 WHERE id=84 AND created_at=1794690003000 AND hash='862147fb3157875cd70b3302ae850a4b2b92b616be4d8ad7b0d5ecc061';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Expected exact old 0082 ledger row'; END IF;
END $repair$;
