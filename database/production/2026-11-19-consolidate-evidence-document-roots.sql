-- CAN OS 2026-11-19: evidence document roots into public.
-- Atomic guarded schema relocation; no data copy or bridge or drop.
DO $migration$
DECLARE
 tables jsonb := '[{"name":"evidence_document_versions","oid":402811,"rls":true,"forced":true,"acl":null,"pol":2,"trg":2,"outf":2,"inf":140,"idx":3},{"name":"evidence_documents","oid":402782,"rls":true,"forced":true,"acl":null,"pol":2,"trg":0,"outf":2,"inf":2,"idx":3}]'::jsonb;
 routines jsonb := '[{"oid":542963,"hash":"dd1433d092f8f6ecd1c56133ea3d1d8c","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543052,"hash":"b28ef245468abcca85cf45a44ac86e15","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543168,"hash":"504789b0412427ce35424d211fe3ffa7","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543171,"hash":"e0808c2541b92ff0b02a2ef176c84d43","lang":14,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"}]'::jsonb;
 item record; f record; obj oid; row_count bigint;
 before text; after text; related integer; rewrite_count integer:=0; rebind_count integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Neon main required'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public CREATE privilege unsafe'; END IF;
 IF jsonb_array_length(tables)<>2 OR jsonb_array_length(routines)<>4
 THEN RAISE EXCEPTION 'Migration snapshot drift'; END IF;
 FOR item IN SELECT * FROM jsonb_to_recordset(tables) AS item(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   obj:=to_regclass(format('education_v30.%I',item.name));
   IF obj IS DISTINCT FROM item.oid::oid
     OR to_regclass(format('public.%I',item.name)) IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
         AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.forced
         AND c.relacl::text IS NOT DISTINCT FROM item.acl)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>item.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>item.trg
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=obj AND contype='f')<>item.outf
     OR (SELECT count(*) FROM pg_constraint WHERE confrelid=obj AND contype='f')<>item.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>item.idx
     OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||item.name||'%')
     OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
          WHERE i.indrelid=obj AND EXISTS(SELECT 1 FROM pg_class d
            WHERE d.relnamespace='public'::regnamespace AND d.relname=ix.relname))
     OR has_table_privilege('authenticated',obj,'SELECT')
     OR has_table_privilege('authenticated',obj,'INSERT')
     OR has_table_privilege('authenticated',obj,'UPDATE')
     OR has_table_privilege('authenticated',obj,'DELETE')
   THEN RAISE EXCEPTION 'Evidence table preflight failed: %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO row_count;
   IF row_count<>0 THEN RAISE EXCEPTION 'Evidence table populated: %',item.name; END IF;
 END LOOP;

 SELECT count(DISTINCT p.oid)::int INTO related FROM pg_proc p JOIN jsonb_array_elements(tables) AS target(value) ON p.prosrc ILIKE '%'||(target.value->>'name')||'%';
 IF related<>24 THEN RAISE EXCEPTION 'Expected 24 related functions, got %',related; END IF;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS identity,p.proconfig,
    pg_get_userbyid(p.proowner) AS owner,n.nspname AS namespace
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN jsonb_array_elements(tables) AS target(value) ON p.prosrc ILIKE '%'||(target.value->>'name')||'%'
 LOOP
    IF f.owner<>'neondb_owner' OR f.namespace<>'education_v30'
       OR (f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
        AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
        AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public, pg_temp']::text[]
        AND f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, education_v30, public, pg_temp']::text[])
    THEN RAISE EXCEPTION 'Unsafe stored routine: %',f.identity; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(routines)
      AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
     AND md5(p.prosrc)=f.hash AND p.prolang=f.lang::oid
     AND p.prosecdef=f.definer AND p.proconfig::text=f.config
     AND pg_get_userbyid(p.proowner)='neondb_owner')
    THEN RAISE EXCEPTION 'Explicit evidence function drift: %',f.oid; END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(tables) AS item(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',item.name);
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(routines)
    AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   before:=pg_get_functiondef(f.oid::oid);
   after:=before;
   FOR item IN SELECT * FROM jsonb_to_recordset(tables) AS item(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
     after:=replace(after,format('education_v30.%I',item.name),format('public.%I',item.name));
   END LOOP;
   IF after=before THEN RAISE EXCEPTION 'No explicit reference found in routine %',f.oid; END IF;
   EXECUTE after;
   rewrite_count:=rewrite_count+1;
 END LOOP;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS identity FROM pg_proc p JOIN jsonb_array_elements(tables) AS target(value) ON p.prosrc ILIKE '%'||(target.value->>'name')||'%'
     WHERE p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
 LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',f.identity);
    rebind_count:=rebind_count+1;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(tables) AS item(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   obj:=to_regclass(format('public.%I',item.name));
   IF obj IS DISTINCT FROM item.oid::oid
    OR to_regclass(format('education_v30.%I',item.name)) IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
       AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.forced
       AND c.relacl::text IS NOT DISTINCT FROM item.acl)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>item.pol
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>item.trg
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid=obj AND contype='f')<>item.outf
    OR (SELECT count(*) FROM pg_constraint WHERE confrelid=obj AND contype='f')<>item.inf
    OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>item.idx
   THEN RAISE EXCEPTION 'Evidence postflight mismatch: %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',item.name) INTO row_count;
   IF row_count<>0 THEN RAISE EXCEPTION 'Unexpected migrated evidence rows: %',item.name; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(routines)
    AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid AND md5(p.prosrc)<>f.hash
      AND p.prosecdef=f.definer AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Evidence routine replacement failed: %',f.oid; END IF;
   IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
      AND (p.prosrc ILIKE '%education_v30.evidence_documents%'
          OR p.prosrc ILIKE '%education_v30.evidence_document_versions%'))
   THEN RAISE EXCEPTION 'Retired evidence schema still referenced by %',f.oid; END IF;
 END LOOP;
 RAISE NOTICE 'Two evidence tables moved; % SQL functions rewritten, % paths rebound',rewrite_count,rebind_count;
END $migration$;