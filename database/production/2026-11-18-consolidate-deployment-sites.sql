-- CAN OS production main: move the active Deployment-to-Site relationship to public.
-- One original row, OID preserved, 3 incoming FKs, 2 outgoing FKs, 6 indexes.
-- The authoritative table has no direct authenticated grants. Preserve the
-- existing owner-only access and RLS status; do NOT grant new access here.
-- Rebind both SECURITY DEFINER validation triggers without changing their
-- narrow search_path, function OIDs, roles or business rules.
-- No duplicate/bridge tables, DROP or CASCADE.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$
DECLARE t oid; r record; name text; fn oid; src text; expected_count integer;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Wrong database: Neon production main only'; END IF;
 t:=to_regclass('education_v30.deployment_sites');
 IF t IS DISTINCT FROM 404955::oid
 OR to_regclass('public.deployment_sites') IS NOT NULL
 THEN RAISE EXCEPTION 'Source deployment_sites identity or public name changed'; END IF;
 SELECT c.relkind,c.relacl,c.relrowsecurity,c.relforcerowsecurity INTO r
 FROM pg_class c WHERE c.oid=t;
 IF r.relkind<>'r' OR r.relacl IS NOT NULL OR r.relrowsecurity OR r.relforcerowsecurity
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=t)<>0
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=t AND contype='f')<>2
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=t AND contype='f')<>3
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=t AND NOT tgisinternal)<>0
 OR (SELECT count(*) FROM pg_index WHERE indrelid=t)<>6
 OR (SELECT count(*) FROM education_v30.deployment_sites)<>1
 OR has_table_privilege('authenticated',t,'SELECT')
 OR has_table_privilege('authenticated',t,'INSERT')
 OR has_table_privilege('authenticated',t,'UPDATE')
 OR has_table_privilege('authenticated',t,'DELETE')
 OR EXISTS(SELECT 1 FROM pg_index idx JOIN pg_class i ON i.oid=idx.indexrelid
    JOIN pg_class dst ON dst.relnamespace='public'::regnamespace AND dst.relname=i.relname
    WHERE idx.indrelid=t)
 THEN RAISE EXCEPTION 'Unexpected records, FK, index or access rules'; END IF;
 FOR name,fn,expected_count IN
  SELECT * FROM (VALUES
    ('v29_guard_operational_gate',417907,2),
    ('v30_guard_shared_resource_allocation',405054,1)
  ) x(name,fn,expected_count)
 LOOP
  IF to_regprocedure(format('education_v30.%I()',name)) IS DISTINCT FROM fn::oid
  THEN RAISE EXCEPTION 'Expected validation function changed: %',name; END IF;
  SELECT p.prosrc INTO src FROM pg_proc p WHERE p.oid=fn
    AND p.prosecdef AND p.proacl IS NULL
    AND p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[];
  IF src IS NULL
   OR (length(src)-length(replace(src,'FROM deployment_sites ds',''))) /
      length('FROM deployment_sites ds')<>expected_count
   OR position('FROM public.deployment_sites ds' in src)<>0
  THEN RAISE EXCEPTION 'Validation function definition changed: %',name; END IF;
 END LOOP;
END $guard$;
ALTER TABLE education_v30.deployment_sites SET SCHEMA public;
DO $rebind$
DECLARE name text; def text;
BEGIN
 FOR name IN SELECT * FROM (VALUES
   ('v29_guard_operational_gate'),('v30_guard_shared_resource_allocation')
 ) t(name) LOOP
   def:=pg_get_functiondef(to_regprocedure(format('education_v30.%I()',name)));
   IF position('FROM deployment_sites ds' in def)=0
   THEN RAISE EXCEPTION 'Missing qualified replacement target: %',name; END IF;
   EXECUTE replace(def,'FROM deployment_sites ds','FROM public.deployment_sites ds');
 END LOOP;
END $rebind$;
DO $verify$
DECLARE t oid; r record; name text; fn oid; expected_count integer; src text;
BEGIN
 t:=to_regclass('public.deployment_sites');
 IF t IS DISTINCT FROM 404955::oid OR to_regclass('education_v30.deployment_sites') IS NOT NULL
 THEN RAISE EXCEPTION 'Original table did not relocate'; END IF;
 SELECT c.relkind,c.relacl,c.relrowsecurity,c.relforcerowsecurity INTO r FROM pg_class c WHERE c.oid=t;
 IF r.relkind<>'r' OR r.relacl IS NOT NULL OR r.relrowsecurity OR r.relforcerowsecurity
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=t)<>0
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=t AND contype='f')<>2
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=t AND contype='f')<>3
 OR (SELECT count(*) FROM pg_index WHERE indrelid=t)<>6
 OR (SELECT count(*) FROM public.deployment_sites)<>1
 OR has_table_privilege('authenticated',t,'SELECT')
 OR has_table_privilege('authenticated',t,'INSERT')
 OR has_table_privilege('authenticated',t,'UPDATE')
 OR has_table_privilege('authenticated',t,'DELETE')
 THEN RAISE EXCEPTION 'Data, FK, indexes or access changed in move'; END IF;
 FOR name,fn,expected_count IN SELECT * FROM (VALUES
   ('v29_guard_operational_gate',417907,2),
   ('v30_guard_shared_resource_allocation',405054,1)
 ) x(name,fn,expected_count) LOOP
  SELECT p.prosrc INTO src FROM pg_proc p WHERE p.oid=fn
     AND p.prosecdef AND p.proacl IS NULL
     AND p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[];
  IF src IS NULL
   OR (length(src)-length(replace(src,'FROM public.deployment_sites ds',''))) /
      length('FROM public.deployment_sites ds')<>expected_count
   OR position('FROM deployment_sites ds' in src)<>0
  THEN RAISE EXCEPTION 'Validator source or security changed: %',name; END IF;
 END LOOP;
END $verify$;
COMMIT;
