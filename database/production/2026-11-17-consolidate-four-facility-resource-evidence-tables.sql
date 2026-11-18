-- Neon main: guarded move of four empty facility/resource/professional service evidence tables.
-- Preserve exact table OIDs, all inbound and outgoing FK relationships, forced RLS,
-- owner-only access, triggers and index identity. No CASCADE, copy, bridge or privilege grant.
-- Update the six dependent native functions in the SAME SQL transaction.
BEGIN;

-- STEP 1
SET LOCAL lock_timeout = '5s';

-- STEP 2
SET LOCAL statement_timeout = '90s';

-- STEP 3
DO $preflight$
DECLARE x record; obj oid; n bigint; refs integer; fn record; source text; hits integer;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Refuse database other than CAN OS production main'; END IF;
 FOR x IN SELECT * FROM (VALUES
  ('blueprint_facility_requirements',411738::oid,1,2,3),
  ('site_space_capability_assertions',411656::oid,1,4,6),
  ('shared_resource_pools',404988::oid,1,2,3),
  ('professional_service_delivery_records',407872::oid,1,4,5)
 ) AS expected(tab,expected_oid,inbound_fks,outbound_fks,indexes) LOOP
  obj:=to_regclass('education_v30.'||x.tab);
  IF obj IS NULL OR obj<>x.expected_oid OR to_regclass('public.'||x.tab) IS NOT NULL
  THEN RAISE EXCEPTION 'Missing, changed or colliding original table: %',x.tab; END IF;
  EXECUTE format('LOCK TABLE education_v30.%I IN ACCESS EXCLUSIVE MODE',x.tab);
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
    AND c.relowner='neondb_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity)
    OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=obj AND p.polroles=ARRAY['neondb_owner'::regrole]::oid[] AND p.polcmd='*')<>1
    OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=obj)<>1
    OR (SELECT count(*) FROM pg_constraint f WHERE f.confrelid=obj AND f.contype='f' AND f.convalidated)<>x.inbound_fks
    OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.confrelid=obj AND f.contype='f' AND NOT f.convalidated)
    OR (SELECT count(*) FROM pg_constraint f WHERE f.conrelid=obj AND f.contype='f' AND f.convalidated)<>x.outbound_fks
    OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.conrelid=obj AND f.contype='f' AND NOT f.convalidated)
    OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=obj AND NOT t.tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=obj AND d.deptype='n' AND d.classid NOT IN('pg_constraint'::regclass,'pg_policy'::regclass))
    OR has_table_privilege('authenticated',obj,'SELECT') OR has_table_privilege('anonymous',obj,'SELECT')
  THEN RAISE EXCEPTION 'Security, foreign key or dependency drift on %',x.tab; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',x.tab) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Refuse to migrate populated table %',x.tab; END IF;
  IF (SELECT count(*) FROM pg_index i WHERE i.indrelid=obj)<>x.indexes
    OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
       WHERE i.indrelid=obj AND EXISTS(SELECT 1 FROM pg_class target JOIN pg_namespace ns ON ns.oid=target.relnamespace
         WHERE ns.nspname='public' AND target.relname=ix.relname))
  THEN RAISE EXCEPTION 'Index count or namespace collision on %',x.tab; END IF;
 END LOOP;
 SELECT count(*) INTO refs FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','education_v30','education_v30_secure') AND p.prokind IN('f','p')
 AND (pg_get_functiondef(p.oid) ILIKE '%blueprint_facility_requirements%' OR pg_get_functiondef(p.oid) ILIKE '%site_space_capability_assertions%' OR pg_get_functiondef(p.oid) ILIKE '%shared_resource_pools%' OR pg_get_functiondef(p.oid) ILIKE '%professional_service_delivery_records%');
 IF refs<>6 THEN RAISE EXCEPTION 'Expected six dependent function bodies; found %',refs; END IF;
 FOR fn IN SELECT * FROM (VALUES
  ('v27_check_facility_requirement','FROM blueprint_facility_requirements',1),
  ('v27_check_facility_requirement','JOIN site_space_capability_assertions',2),
  ('v27_check_facility_verification','FROM site_space_capability_assertions',1),
  ('v292_guard_fit_requirement_result','JOIN site_space_capability_assertions',1),
  ('v29_guard_evaluation_facility','JOIN site_space_capability_assertions',1),
  ('v30_guard_shared_resource_allocation','FROM shared_resource_pools',1),
  ('validate_workforce_earning','FROM professional_service_delivery_records',1)
 ) AS x(name,old_text,expected_hits) LOOP
  SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='education_v30' AND p.proname=fn.name;
  IF source IS NULL THEN RAISE EXCEPTION 'Missing native function: %',fn.name; END IF;
  hits:=(length(source)-length(replace(source,fn.old_text,'')))/length(fn.old_text);
  IF hits<>fn.expected_hits THEN RAISE EXCEPTION 'Function or reference count changed: %',fn.name; END IF;
 END LOOP;
END $preflight$;

-- STEP 4
ALTER TABLE education_v30.blueprint_facility_requirements SET SCHEMA public;

-- STEP 5
ALTER TABLE education_v30.site_space_capability_assertions SET SCHEMA public;

-- STEP 6
ALTER TABLE education_v30.shared_resource_pools SET SCHEMA public;

-- STEP 7
ALTER TABLE education_v30.professional_service_delivery_records SET SCHEMA public;

-- STEP 8
DO $rewrite$
DECLARE function_name text; source text; statement text; entry record;
BEGIN
 FOREACH function_name IN ARRAY ARRAY[
   'v27_check_facility_requirement',
   'v27_check_facility_verification',
   'v292_guard_fit_requirement_result',
   'v29_guard_evaluation_facility',
   'v30_guard_shared_resource_allocation',
   'validate_workforce_earning'
 ] LOOP
  SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30' AND p.proname=function_name;
  IF source IS NULL THEN RAISE EXCEPTION 'Missing SQL function: %',function_name; END IF;
  statement:=source;
  FOR entry IN SELECT * FROM (VALUES
    ('v27_check_facility_requirement','FROM blueprint_facility_requirements','FROM public.blueprint_facility_requirements',1),
    ('v27_check_facility_requirement','JOIN site_space_capability_assertions','JOIN public.site_space_capability_assertions',2),
    ('v27_check_facility_verification','FROM site_space_capability_assertions','FROM public.site_space_capability_assertions',1),
    ('v292_guard_fit_requirement_result','JOIN site_space_capability_assertions','JOIN public.site_space_capability_assertions',1),
    ('v29_guard_evaluation_facility','JOIN site_space_capability_assertions','JOIN public.site_space_capability_assertions',1),
    ('v30_guard_shared_resource_allocation','FROM shared_resource_pools','FROM public.shared_resource_pools',1),
    ('validate_workforce_earning','FROM professional_service_delivery_records','FROM public.professional_service_delivery_records',1)
  ) AS m(name,from_text,to_text,expected_hits) WHERE name=function_name LOOP
    IF (length(statement)-length(replace(statement,entry.from_text,'')))/length(entry.from_text)
      <>entry.expected_hits THEN
      RAISE EXCEPTION 'Unexpected function fragment for %',function_name;
    END IF;
    statement:=replace(statement,entry.from_text,entry.to_text);
  END LOOP;
  EXECUTE statement;
 END LOOP;
END $rewrite$;

COMMIT;
