-- CAN OS: retire the unused education_v30.admission_offers duplicate.
-- The live admissions implementation uses public.admission_offers; those rows are preserved.
-- Preconditions checked against Neon main: duplicate has 0 rows, 0 inbound FKs,
-- 0 non-internal triggers, 0 RLS policies, 0 routine source references.
-- No CASCADE, no identity translation, no shared admissions changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
DO $guard$
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'Wrong database: native admission_offers cleanup is main-only';
  END IF;
  IF to_regclass('education_v30.admission_offers') IS NULL
     OR to_regclass('public.admission_offers') IS NULL THEN
    RAISE EXCEPTION 'Missing reviewed source or authoritative admissions table';
  END IF;
  IF EXISTS (SELECT 1 FROM education_v30.admission_offers) THEN
    RAISE EXCEPTION 'Native admission_offers now contains data. Refusing deletion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admission_offers) THEN
    RAISE EXCEPTION 'No active shared admission offers; recheck semantics';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE confrelid='education_v30.admission_offers'::regclass AND contype='f'
  ) THEN RAISE EXCEPTION 'Inbound foreign keys still exist'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='education_v30.admission_offers'::regclass AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'Native business triggers still exist'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid='education_v30.admission_offers'::regclass
  ) THEN RAISE EXCEPTION 'Native access policies still exist'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','education_v30','education_v30_secure')
      AND p.prokind IN ('f','p')
      AND pg_get_functiondef(p.oid) ILIKE '%admission_offers%'
  ) THEN RAISE EXCEPTION 'Database routine still references native admission offers'; END IF;
END $guard$;
DROP TABLE education_v30.admission_offers RESTRICT;
COMMIT;
