-- CAN OS production main: consolidate a dormant, independently governed
-- workforce earning-event table into the authoritative public schema.
-- Table stays the SAME object (OID); no copy, DELETE, CASCADE, or role grant.
-- Retain 6 existing outbound FKs, one trigger, one FORCE RLS policy, indexes.
-- This file is not added to an automatic Drizzle migration journal.
DO $retire_native_workforce_events$
DECLARE
  original_oid oid := to_regclass('education_v30.workforce_earning_events')::oid;
  found bigint;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'Refusing non-CAN OS main database';
  END IF;
  IF original_oid IS NULL THEN
    IF to_regclass('public.workforce_earning_events') IS NOT NULL THEN
      RAISE NOTICE 'Workforce earning events already consolidated';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Missing source workforce earning-events table';
  END IF;
  IF to_regclass('public.workforce_earning_events') IS NOT NULL THEN
    RAISE EXCEPTION 'Public workforce earning-events table name collision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=original_oid
      AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=original_oid)<>1
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid=original_oid AND contype='f')<>6
    OR EXISTS(SELECT 1 FROM pg_constraint WHERE confrelid=original_oid AND contype='f')
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=original_oid AND NOT tgisinternal)<>1
    OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid
      WHERE d.refobjid=original_oid)
  THEN RAISE EXCEPTION 'Unexpected workforce table ownership/security/dependencies'; END IF;
  EXECUTE 'SELECT count(*) FROM education_v30.workforce_earning_events' INTO found;
  IF found<>0 THEN
    RAISE EXCEPTION 'Do not move populated financial earning events without a data acceptance plan';
  END IF;
  -- No stored routine refers to the table itself; its existing trigger
  -- function remains in education_v30 and still checks native compensation
  -- terms under its explicitly set search_path.
  IF EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname IN ('public','education_v30','education_v30_secure')
       AND p.prokind IN ('f','p')
       AND pg_get_functiondef(p.oid) ILIKE '%workforce_earning_events%'
  ) THEN RAISE EXCEPTION 'Native workforce table has function call sites'; END IF;
  PERFORM set_config('lock_timeout','5s',true);
  EXECUTE 'ALTER TABLE education_v30.workforce_earning_events SET SCHEMA public';
  IF to_regclass('public.workforce_earning_events')::oid IS DISTINCT FROM original_oid
    OR to_regclass('education_v30.workforce_earning_events') IS NOT NULL
  THEN RAISE EXCEPTION 'Workforce earning-event move did not preserve identity'; END IF;
END
$retire_native_workforce_events$;
