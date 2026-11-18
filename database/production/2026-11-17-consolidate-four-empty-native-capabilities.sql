-- CAN OS Neon main only. Move four empty, non-colliding capability tables.
-- Retain OIDs, original FORCED RLS, policies, FKs, owner and privileges.
-- Rebind 4 live SQL routine bodies to public.table in the same transaction.
-- No DROP, copy, identity aliases, or loss of business evidence.
BEGIN;

-- STEP 1
SET LOCAL lock_timeout='5s';

-- STEP 2
SET LOCAL statement_timeout='90s';

-- STEP 3
DO $preflight$
DECLARE name text; rows_count bigint; refs integer; def text; sig text; candidate record;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb' THEN
   RAISE EXCEPTION 'Refusing non-main CAN OS database';
 END IF;
 FOREACH name IN ARRAY ARRAY['equipment_ownership_periods','evaluation_basis_invalidations','improvement_action_evidence','qualification_reassessment_requests'] LOOP
  IF to_regclass('education_v30.'||name) IS NULL
    OR to_regclass('public.'||name) IS NOT NULL THEN
    RAISE EXCEPTION 'Missing source or public collision for %',name;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c
    WHERE c.oid=to_regclass('education_v30.'||name)
      AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'RLS not forced on %',name;
  END IF;
  IF (SELECT count(*) FROM pg_policy p
      WHERE p.polrelid=to_regclass('education_v30.'||name))<>1 THEN
    RAISE EXCEPTION 'Unexpected policy count on %',name;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint f
     WHERE f.contype='f' AND f.confrelid=to_regclass('education_v30.'||name))
   OR EXISTS(SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid=to_regclass('education_v30.'||name) AND NOT t.tgisinternal)
   OR EXISTS (SELECT 1 FROM pg_depend d
     WHERE d.refobjid=to_regclass('education_v30.'||name)
       AND d.deptype='n'
       AND d.classid NOT IN ('pg_constraint'::regclass,'pg_policy'::regclass)) THEN
   RAISE EXCEPTION 'Incoming FK, trigger or unexpected dependency for %',name;
  END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO rows_count;
  IF rows_count<>0 THEN RAISE EXCEPTION 'Table % is no longer empty',name; END IF;
 END LOOP;
 SELECT count(*) INTO refs FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN('public','education_v30','education_v30_secure')
   AND p.prokind IN('f','p')
   AND (pg_get_functiondef(p.oid) ILIKE '%equipment_ownership_periods%' OR pg_get_functiondef(p.oid) ILIKE '%evaluation_basis_invalidations%' OR pg_get_functiondef(p.oid) ILIKE '%improvement_action_evidence%' OR pg_get_functiondef(p.oid) ILIKE '%qualification_reassessment_requests%');
 IF refs<>4 THEN RAISE EXCEPTION 'Expected 4 SQL routine references, observed %',refs; END IF;
END $preflight$;

-- STEP 4
ALTER TABLE education_v30.equipment_ownership_periods SET SCHEMA public;

-- STEP 5
ALTER TABLE education_v30.evaluation_basis_invalidations SET SCHEMA public;

-- STEP 6
ALTER TABLE education_v30.improvement_action_evidence SET SCHEMA public;

-- STEP 7
ALTER TABLE education_v30.qualification_reassessment_requests SET SCHEMA public;

-- STEP 8
DO $rewire$
DECLARE f record; source text; updated text; occurrence_count int;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('v29_guard_subject','FROM equipment_ownership_periods o','FROM public.equipment_ownership_periods o',1),
 ('v30_evaluation_basis_is_current','FROM evaluation_basis_invalidations','FROM public.evaluation_basis_invalidations',1),
 ('v27_verify_improvement','FROM improvement_action_evidence','FROM public.improvement_action_evidence',1),
 ('v29_queue_qualification_reassessment','INTO qualification_reassessment_requests(','INTO public.qualification_reassessment_requests(',3)
 ) AS t(function_name,search_text,replace_text,expected_count) LOOP
   SELECT pg_get_functiondef(p.oid) INTO source
   FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='education_v30' AND p.proname=f.function_name;
   IF source IS NULL THEN RAISE EXCEPTION 'Missing canonical routine %',f.function_name; END IF;
   occurrence_count:=(length(source)-length(replace(source,f.search_text,'')))/length(f.search_text);
   IF occurrence_count<>f.expected_count THEN
     RAISE EXCEPTION 'Unexpected routine % reference count: %, expected %',
       f.function_name,occurrence_count,f.expected_count;
   END IF;
   updated:=replace(source,f.search_text,f.replace_text);
   EXECUTE updated;
 END LOOP;
END $rewire$;

COMMIT;
