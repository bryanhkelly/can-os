-- CAN OS main, nine instructional-track tables, no DROP or copy.
-- Existing Drizzle mappings updated to public in the same main branch.
DO $cutover$
DECLARE snapshot jsonb:='[{"name":"instructional_track_materials","oid":403711,"rls":true,"forced":true,"pol":1,"trg":2,"outf":3,"inf":0,"idx":4},{"name":"instructional_track_policy_versions","oid":404812,"rls":true,"forced":true,"pol":2,"trg":2,"outf":4,"inf":3,"idx":8},{"name":"instructional_track_policy_withdrawals","oid":404875,"rls":true,"forced":true,"pol":1,"trg":1,"outf":2,"inf":0,"idx":3},{"name":"instructional_track_reviews","oid":404348,"rls":true,"forced":true,"pol":1,"trg":1,"outf":3,"inf":0,"idx":6},{"name":"instructional_track_versions","oid":403656,"rls":true,"forced":true,"pol":2,"trg":3,"outf":5,"inf":16,"idx":8},{"name":"instructional_tracks","oid":403628,"rls":true,"forced":true,"pol":1,"trg":1,"outf":3,"inf":4,"idx":5},{"name":"learner_track_selections","oid":405546,"rls":true,"forced":true,"pol":2,"trg":1,"outf":4,"inf":0,"idx":9},{"name":"track_distribution_authorizations","oid":404624,"rls":true,"forced":true,"pol":1,"trg":1,"outf":6,"inf":0,"idx":7},{"name":"track_lesson_presentations","oid":404387,"rls":true,"forced":true,"pol":1,"trg":1,"outf":3,"inf":1,"idx":7}]'::jsonb; item record; fn record; rel oid; rows bigint; nfuncs integer; changed integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Requires CAN OS production main'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Unsafe definer fallback to writable public'; END IF;
 IF jsonb_array_length(snapshot)<>9 THEN RAISE EXCEPTION 'Expected nine tables'; END IF;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   rel:=to_regclass(format('education_v30.%I',item.name));
   IF rel IS DISTINCT FROM item.oid::oid
      OR to_regclass(format('public.%I',item.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
        AND c.relacl IS NULL AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.forced)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>item.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>item.trg
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=rel AND contype='f')<>item.outf
      OR (SELECT count(*) FROM pg_constraint WHERE confrelid=rel AND contype='f')<>item.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>item.idx
      OR EXISTS(SELECT 1 FROM pg_proc f WHERE f.prosrc ILIKE '%education_v30.'||item.name||'%')
      OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||item.name||'%')
      OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
        WHERE i.indrelid=rel AND EXISTS(SELECT 1 FROM pg_class t WHERE t.relnamespace='public'::regnamespace AND t.relname=ix.relname))
      OR has_table_privilege('authenticated',rel,'SELECT')
      OR has_table_privilege('authenticated',rel,'INSERT')
      OR has_table_privilege('authenticated',rel,'UPDATE')
      OR has_table_privilege('authenticated',rel,'DELETE')
   THEN RAISE EXCEPTION 'Preflight mismatch: %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO rows;
   IF rows<>0 THEN RAISE EXCEPTION 'Unexpected source data: %',item.name; END IF;
 END LOOP;
 SELECT count(DISTINCT p.oid)::int INTO nfuncs
 FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS dep(value)
   ON p.prosrc ILIKE '%'||(dep.value->>'name')||'%';
 IF nfuncs<>12 THEN RAISE EXCEPTION 'Routine dependencies changed, expected 12 found %',nfuncs; END IF;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident,p.proconfig,p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner,ns.nspname AS namespace
   FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     JOIN jsonb_array_elements(snapshot) AS dep(value) ON p.prosrc ILIKE '%'||(dep.value->>'name')||'%'
 LOOP
   IF fn.owner<>'neondb_owner' OR fn.namespace<>'education_v30'
      OR (fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
        AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[])
   THEN RAISE EXCEPTION 'Unexpected routine access: %',fn.ident; END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',item.name);
 END LOOP;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident
    FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS dep(value)
      ON p.prosrc ILIKE '%'||(dep.value->>'name')||'%'
    WHERE p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
 LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',fn.ident);
    changed:=changed+1;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
    rel:=to_regclass(format('public.%I',item.name));
    IF rel IS DISTINCT FROM item.oid::oid
       OR to_regclass(format('education_v30.%I',item.name)) IS NOT NULL
       OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
          AND c.relacl IS NULL AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.forced)
       OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>item.pol
       OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>item.trg
       OR (SELECT count(*) FROM pg_constraint WHERE conrelid=rel AND contype='f')<>item.outf
       OR (SELECT count(*) FROM pg_constraint WHERE confrelid=rel AND contype='f')<>item.inf
       OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>item.idx
    THEN RAISE EXCEPTION 'Postflight structural mismatch: %',item.name; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I',item.name) INTO rows;
    IF rows<>0 THEN RAISE EXCEPTION 'Unexpected moved records: %',item.name; END IF;
 END LOOP;
 RAISE NOTICE 'Moved nine instructional-track tables; rebound % routines',changed;
END $cutover$;