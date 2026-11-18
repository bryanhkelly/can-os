-- CAN OS main: relocate the populated Service Capability catalog into public.
-- This is an OID-preserving move, not a copy or a parallel capability authority.
-- 13 existing rows, 8 inbound FKs, 1 outbound FK, no direct authenticated
-- grants or RLS policies. Rebind the three exact dependent validation functions
-- in the SAME transaction; no CASCADE, relaxed access, or dropped structures.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$
DECLARE t oid; f oid; rule record; src text;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Neon production main required'; END IF;
 t:=to_regclass('education_v30.service_capabilities');
 IF t IS DISTINCT FROM 402887::oid OR to_regclass('public.service_capabilities') IS NOT NULL
 THEN RAISE EXCEPTION 'Unexpected table identity or public collision'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=t AND relkind='r'
    AND relacl IS NULL AND NOT relrowsecurity AND NOT relforcerowsecurity)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=t)<>0
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=t AND NOT tgisinternal)<>0
 OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=t)<>1
 OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=t)<>8
 OR (SELECT count(*) FROM pg_index WHERE indrelid=t)<>3
 OR (SELECT count(*) FROM education_v30.service_capabilities)<>13
 OR has_table_privilege('authenticated',t,'SELECT')
 OR has_table_privilege('authenticated',t,'INSERT')
 OR has_table_privilege('authenticated',t,'UPDATE')
 OR has_table_privilege('authenticated',t,'DELETE')
 OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
   JOIN pg_class pub ON pub.relnamespace='public'::regnamespace AND pub.relname=ix.relname
   WHERE i.indrelid=t)
 THEN RAISE EXCEPTION 'Service capability data, ACL, FK or index baseline changed'; END IF;
 FOR rule IN SELECT * FROM (VALUES
   ('validate_assessment_scoring',409650,'JOIN service_capabilities sc',1),
   ('validate_assessment_scoring_assignment',409652,'FROM service_capabilities WHERE',1),
   ('validate_grading_appointment',409566,'FROM service_capabilities WHERE',1)
 ) r(name,fn_oid,old_fragment,expected_count) LOOP
   f:=to_regprocedure(format('education_v30.%I()',rule.name));
   IF f IS DISTINCT FROM rule.fn_oid::oid THEN RAISE EXCEPTION 'Validator OID changed: %',rule.name; END IF;
   SELECT p.prosrc INTO src FROM pg_proc p WHERE p.oid=f
     AND NOT p.prosecdef AND p.proacl IS NULL
     AND p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[];
   IF src IS NULL
     OR (length(src)-length(replace(src,rule.old_fragment,'')))/length(rule.old_fragment)<>rule.expected_count
     OR src ILIKE '%public.service_capabilities%'
   THEN RAISE EXCEPTION 'Validator source or security changed: %',rule.name; END IF;
 END LOOP;
END $guard$;
ALTER TABLE education_v30.service_capabilities SET SCHEMA public;
DO $rebind$
DECLARE rule record; def text;
BEGIN
 FOR rule IN SELECT * FROM (VALUES
  ('validate_assessment_scoring','JOIN service_capabilities sc','JOIN public.service_capabilities sc'),
  ('validate_assessment_scoring_assignment','FROM service_capabilities WHERE','FROM public.service_capabilities WHERE'),
  ('validate_grading_appointment','FROM service_capabilities WHERE','FROM public.service_capabilities WHERE')
 ) r(name,old_fragment,new_fragment) LOOP
   def:=pg_get_functiondef(to_regprocedure(format('education_v30.%I()',rule.name)));
   IF position(rule.old_fragment IN def)=0 THEN
     RAISE EXCEPTION 'Validator replacement target missing: %',rule.name;
   END IF;
   EXECUTE replace(def,rule.old_fragment,rule.new_fragment);
 END LOOP;
END $rebind$;
DO $verify$
DECLARE t oid; rule record; f oid; src text;
BEGIN
 t:=to_regclass('public.service_capabilities');
 IF t IS DISTINCT FROM 402887::oid OR to_regclass('education_v30.service_capabilities') IS NOT NULL
 THEN RAISE EXCEPTION 'Service Capability move did not preserve identity'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=t AND relkind='r'
   AND relacl IS NULL AND NOT relrowsecurity AND NOT relforcerowsecurity)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=t)<>0
 OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=t)<>1
 OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=t)<>8
 OR (SELECT count(*) FROM pg_index WHERE indrelid=t)<>3
 OR (SELECT count(*) FROM public.service_capabilities)<>13
 OR has_table_privilege('authenticated',t,'SELECT')
 OR has_table_privilege('authenticated',t,'INSERT')
 OR has_table_privilege('authenticated',t,'UPDATE')
 OR has_table_privilege('authenticated',t,'DELETE')
 THEN RAISE EXCEPTION 'Service Capability post-move checks failed'; END IF;
 FOR rule IN SELECT * FROM (VALUES
  ('validate_assessment_scoring',409650,'JOIN public.service_capabilities sc'),
  ('validate_assessment_scoring_assignment',409652,'FROM public.service_capabilities WHERE'),
  ('validate_grading_appointment',409566,'FROM public.service_capabilities WHERE')
 ) r(name,fn_oid,new_fragment) LOOP
  f:=to_regprocedure(format('education_v30.%I()',rule.name));
  SELECT p.prosrc INTO src FROM pg_proc p WHERE p.oid=f
    AND NOT p.prosecdef AND p.proacl IS NULL
    AND p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[];
  IF f IS DISTINCT FROM rule.fn_oid::oid OR src IS NULL
    OR position(rule.new_fragment IN src)=0
  THEN RAISE EXCEPTION 'Validator rebind or permissions changed: %',rule.name; END IF;
 END LOOP;
END $verify$;
COMMIT;
