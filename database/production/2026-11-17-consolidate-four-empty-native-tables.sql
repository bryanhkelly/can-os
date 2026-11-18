-- CAN OS main-only guarded relocation of four empty native tables.
-- Never treats a same-named public table as an alias; preserves relation OIDs/FKs.
-- No service or authorization behavior is changed by this migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
DECLARE name text; n bigint; BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909' OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing database other than actual Neon main'; END IF;
 FOREACH name IN ARRAY ARRAY['professional_profiles','credential_definitions','session_attendance','staff_assignments'] LOOP
  IF to_regclass('education_v30.'||name) IS NULL OR to_regclass('public.'||name) IS NOT NULL
  THEN RAISE EXCEPTION 'Missing or colliding table: %',name; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('education_v30.'||name) AND c.relkind='r'
      AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity AND c.relacl IS NULL)
   OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='education_v30' AND tablename=name)
   OR EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('education_v30.'||name) AND NOT t.tgisinternal)
   OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||name||'%')
   OR EXISTS (SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||name||'%')
  THEN RAISE EXCEPTION 'Unexpected policy, ACL, trigger, routine or view dependency: %',name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Source is no longer empty: % (% records)',name,n; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.professional_profiles SET SCHEMA public;
ALTER TABLE education_v30.credential_definitions SET SCHEMA public;
ALTER TABLE education_v30.session_attendance SET SCHEMA public;
ALTER TABLE education_v30.staff_assignments SET SCHEMA public;
DO $verify$
DECLARE name text; n bigint; BEGIN
 FOREACH name IN ARRAY ARRAY['professional_profiles','credential_definitions','session_attendance','staff_assignments'] LOOP
  IF to_regclass('education_v30.'||name) IS NOT NULL OR to_regclass('public.'||name) IS NULL
  THEN RAISE EXCEPTION 'Incomplete table move: %',name; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',name) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Row count mismatch after move: %',name; END IF;
 END LOOP;
END $verify$;
COMMIT;
