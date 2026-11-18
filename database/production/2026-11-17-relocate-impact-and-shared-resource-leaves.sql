-- CAN OS main: atomically move two empty protected tables and rebind their
-- two SECURITY DEFINER SQL functions. OIDs, FKs, FORCE RLS, policies,
-- triggers, indexes and privileges remain unchanged. No bridges or copies.
DO $main_consolidation$
DECLARE t record; f record; original oid; body text; src text; dest text; hit integer; count_rows bigint;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' THEN RAISE EXCEPTION 'Neon production main required'; END IF;
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','90s',true);
 FOR t IN SELECT * FROM (VALUES
   ('initiative_metric_observation_sources',2,1),
   ('shared_resource_allocations',2,1)
 ) expected(name,fks,triggers) LOOP
  original:=to_regclass('education_v30.'||t.name)::oid;
  IF original IS NULL AND to_regclass('public.'||t.name) IS NULL THEN
    RAISE EXCEPTION 'Missing source and destination %',t.name;
  END IF;
  IF original IS NOT NULL THEN
   IF to_regclass('public.'||t.name) IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=original AND c.relkind='r'
         AND c.relrowsecurity AND c.relforcerowsecurity)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=original)<>1
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=original AND contype='f')<>t.fks
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=original AND NOT tgisinternal)<>t.triggers
     OR EXISTS(SELECT 1 FROM pg_constraint WHERE confrelid=original AND contype='f')
     OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid WHERE d.refobjid=original)
   THEN RAISE EXCEPTION 'Changed source security/dependency graph %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',t.name) INTO count_rows;
   IF count_rows<>0 THEN RAISE EXCEPTION 'Do not silently move populated %',t.name; END IF;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','education_v30','education_v30_secure')
        AND p.prokind IN ('f','p') AND
        (pg_get_functiondef(p.oid) ILIKE '%initiative_metric_observation_sources%'
          OR pg_get_functiondef(p.oid) ILIKE '%shared_resource_allocations%'))<>2
 THEN RAISE EXCEPTION 'Unreviewed SQL routine consumer'; END IF;
 FOR f IN SELECT * FROM (VALUES
 ('v30_verify_impact_observation','initiative_metric_observation_sources',1),
 ('v30_guard_shared_resource_allocation','shared_resource_allocations',2)
 ) expected(name,relation,expected_hits) LOOP
   SELECT pg_get_functiondef(p.oid) INTO body FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30' AND p.proname=f.name AND p.pronargs=0 AND p.prokind='f';
   IF body IS NULL OR body NOT LIKE '%SECURITY DEFINER%' OR body NOT LIKE '%SET search_path TO ''education_v30'', ''pg_catalog''%'
   THEN RAISE EXCEPTION 'Security-definer routine changed: %',f.name; END IF;
   src:='FROM '||f.relation; dest:='FROM public.'||f.relation;
   hit:=(length(body)-length(replace(body,src,'')))/length(src);
   IF hit<>f.expected_hits AND NOT (hit=0 AND body LIKE '%'||dest||'%')
   THEN RAISE EXCEPTION 'Unexpected % references in %',hit,f.name; END IF;
 END LOOP;
 FOR t IN SELECT * FROM (VALUES
  ('initiative_metric_observation_sources',2,1),('shared_resource_allocations',2,1)
 ) expected(name,fks,triggers) LOOP
  original:=to_regclass('education_v30.'||t.name)::oid;
  IF original IS NOT NULL THEN
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',t.name);
    IF to_regclass('public.'||t.name)::oid IS DISTINCT FROM original
       OR to_regclass('education_v30.'||t.name) IS NOT NULL
    THEN RAISE EXCEPTION 'OID moved unexpectedly for %',t.name; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||t.name)
    AND c.relrowsecurity AND c.relforcerowsecurity)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=to_regclass('public.'||t.name))<>1
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid=to_regclass('public.'||t.name) AND contype='f')<>t.fks
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=to_regclass('public.'||t.name) AND NOT tgisinternal)<>t.triggers
  THEN RAISE EXCEPTION 'Unverified public table: %',t.name; END IF;
 END LOOP;
 FOR f IN SELECT * FROM (VALUES
 ('v30_verify_impact_observation','initiative_metric_observation_sources',1),
 ('v30_guard_shared_resource_allocation','shared_resource_allocations',2)
 ) expected(name,relation,expected_hits) LOOP
  SELECT pg_get_functiondef(p.oid) INTO body FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='education_v30' AND p.proname=f.name AND p.pronargs=0 AND p.prokind='f';
  src:='FROM '||f.relation; dest:='FROM public.'||f.relation;
  IF body LIKE '%'||src||'%' THEN EXECUTE replace(body,src,dest); END IF;
  SELECT pg_get_functiondef(p.oid) INTO body FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='education_v30' AND p.proname=f.name AND p.pronargs=0 AND p.prokind='f';
  IF body LIKE '%'||src||'%' OR body NOT LIKE '%'||dest||'%'
  THEN RAISE EXCEPTION 'Routine rebind verification failed %',f.name; END IF;
 END LOOP;
END
$main_consolidation$;
