-- CAN OS Neon production MAIN: move the empty protected assessment
-- response asset attachment table to public without losing original OID,
-- composite key, 2 validated foreign keys, 2 security/append-only triggers,
-- owner-only policy or FORCE RLS. No data copy and no bridge object.
-- Database functions and active GitHub code were checked for direct callers.
DO $relocate_assessment_response_assets$
DECLARE
  previous_oid oid := to_regclass('education_v30.assessment_response_assets')::oid;
  migrated_oid oid := to_regclass('public.assessment_response_assets')::oid;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'Only CAN OS Neon production main is authorized';
  END IF;
  IF previous_oid IS NULL THEN
    IF migrated_oid IS NULL THEN
      RAISE EXCEPTION 'Neither native nor public assessment response asset table exists';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=migrated_oid
       AND c.relrowsecurity AND c.relforcerowsecurity)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=migrated_oid)<>1
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=migrated_oid AND contype='f')<>2
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=migrated_oid AND NOT tgisinternal)<>2
    THEN RAISE EXCEPTION 'Existing public assessment response asset table fails integrity check'; END IF;
    RAISE NOTICE 'Protected response assets already moved to public';
    RETURN;
  END IF;
  IF migrated_oid IS NOT NULL THEN RAISE EXCEPTION 'Public table name collision'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=previous_oid
      AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=previous_oid)<>1
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid=previous_oid AND contype='f' AND convalidated)<>2
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=previous_oid AND NOT tgisinternal)<>2
    OR EXISTS(SELECT 1 FROM pg_constraint WHERE confrelid=previous_oid AND contype='f')
    OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid WHERE d.refobjid=previous_oid)
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','education_v30','education_v30_secure')
          AND p.prokind IN ('f','p')
          AND pg_get_functiondef(p.oid) ILIKE '%assessment_response_assets%')
  THEN RAISE EXCEPTION 'Unexpected response attachment constraints, trigger, function, view or RLS'; END IF;
  IF EXISTS(SELECT 1 FROM education_v30.assessment_response_assets LIMIT 1)
  THEN RAISE EXCEPTION 'Response evidence exists; explicit migration acceptance required'; END IF;
  PERFORM set_config('lock_timeout','5s',true);
  EXECUTE 'ALTER TABLE education_v30.assessment_response_assets SET SCHEMA public';
  IF to_regclass('public.assessment_response_assets')::oid IS DISTINCT FROM previous_oid
     OR to_regclass('education_v30.assessment_response_assets') IS NOT NULL
  THEN RAISE EXCEPTION 'Assessment response OID-preserving migration failed'; END IF;
END
$relocate_assessment_response_assets$;
