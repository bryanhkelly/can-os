-- CAN OS: retire the empty, isolated native admission offers table.
-- Executed successfully on Neon production main on 2026-11-17.
-- This SQL is retained as the idempotent retirement record for other environments.
-- Unlike the legacy model, public.admission_offers contains live records.
-- Do not replace it, backfill it by email, or use CASCADE.
DO $retire$
DECLARE
  old_table regclass := to_regclass('education_v30.admission_offers');
BEGIN
  IF current_setting('neon.project_id', true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id', true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
     OR current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Expected CAN OS Neon production main';
  END IF;
  IF old_table IS NULL THEN
    RAISE NOTICE 'Legacy native admission offers already retired';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM education_v30.admission_offers LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing to remove populated legacy admission offers';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE confrelid = old_table AND contype='f') THEN
    RAISE EXCEPTION 'Refusing to remove a referenced legacy table';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_depend d
             JOIN pg_rewrite r ON r.oid=d.objid
             WHERE d.refobjid=old_table) THEN
    RAISE EXCEPTION 'Refusing to remove a table needed by a view';
  END IF;
  EXECUTE 'SET LOCAL lock_timeout = ''4s''';
  DROP TABLE education_v30.admission_offers RESTRICT;
END
$retire$;
