-- CAN OS production main, native Course version/lesson/Offering-course cutover.
-- Three populated tables (six rows), five schema-qualified database routines.
-- Migrate in one atomic transaction: original table and function OIDs preserved.
-- Rebind the 5 qualified bodies to public, and append public to appropriate
-- routine search paths. No copying, shadow tables, bridges, DROP or CASCADE.
DO $cutover$
DECLARE
 snapshot jsonb:='[{"name":"course_lessons","oid":403585,"rls":false,"forced":false,"acl":null,"pol":0,"trg":1,"outf":1,"inf":8,"idx":4,"expected_rows":4},{"name":"course_versions","oid":403470,"rls":false,"forced":false,"acl":null,"pol":0,"trg":1,"outf":1,"inf":28,"idx":3,"expected_rows":1},{"name":"offering_courses","oid":403522,"rls":false,"forced":false,"acl":null,"pol":0,"trg":1,"outf":2,"inf":6,"idx":2,"expected_rows":1}]'::jsonb;
 expected_functions jsonb:='[{"oid":543052,"md5":"760267a0e900dde6f3791b7896f34295","lang_oid":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":543168,"md5":"07d95e0ccfd6712f908ddcd54b9e56b4","lang_oid":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":543171,"md5":"60b287c39d92af469338a0576405da60","lang_oid":14,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":543211,"md5":"2e75c4613d1b15dba4272a4064577d4d","lang_oid":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":543423,"md5":"a31fc1db46ead34c73c86336c2dd0d4d","lang_oid":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"}]'::jsonb;
 rel record; fn record; current_fn record; obj oid; row_count bigint;
 definition text; updated_definition text;
 routine_count integer; altered_routines integer:=0; rebound integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Refusing non-main migration'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Untrusted public CREATE prevents safe function fallback'; END IF;
 IF jsonb_array_length(snapshot)<>3 OR jsonb_array_length(expected_functions)<>5
 THEN RAISE EXCEPTION 'Incorrect migration snapshot'; END IF;
 FOR rel IN SELECT * FROM jsonb_to_recordset(snapshot) AS rel(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer,expected_rows integer) LOOP
   obj:=to_regclass(format('education_v30.%I',rel.name));
   IF obj IS DISTINCT FROM rel.oid::oid
     OR to_regclass(format('public.%I',rel.name)) IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
       AND c.relrowsecurity=rel.rls AND c.relforcerowsecurity=rel.forced
       AND c.relacl::text IS NOT DISTINCT FROM rel.acl)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>rel.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>rel.trg
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=obj)<>rel.outf
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>rel.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>rel.idx
     OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||rel.name||'%')
     OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
       WHERE i.indrelid=obj AND EXISTS(SELECT 1 FROM pg_class dst
         WHERE dst.relnamespace='public'::regnamespace AND dst.relname=ix.relname))
     OR has_table_privilege('authenticated',obj,'SELECT')
     OR has_table_privilege('authenticated',obj,'INSERT')
     OR has_table_privilege('authenticated',obj,'UPDATE')
     OR has_table_privilege('authenticated',obj,'DELETE')
   THEN RAISE EXCEPTION 'Preflight table drift: %',rel.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',rel.name) INTO row_count;
   IF row_count<>rel.expected_rows
   THEN RAISE EXCEPTION 'Source data drift: % expected % got %',rel.name,rel.expected_rows,row_count; END IF;
 END LOOP;
 SELECT count(DISTINCT p.oid)::int INTO routine_count
 FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS needle(value) ON p.prosrc ILIKE '%'||(needle.value->>'name')||'%';
 IF routine_count<>17 THEN
   RAISE EXCEPTION 'Expected 17 dependent routines, found %',routine_count;
 END IF;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident,p.proconfig,p.prosecdef,
        pg_get_userbyid(p.proowner) AS owner,n.nspname AS namespace
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN jsonb_array_elements(snapshot) AS needle(value) ON p.prosrc ILIKE '%'||(needle.value->>'name')||'%'
 LOOP
   IF fn.owner<>'neondb_owner' OR fn.namespace<>'education_v30'
     OR (fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
      AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
      AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public, pg_temp']::text[]
      AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, education_v30, public, pg_temp']::text[])
   THEN RAISE EXCEPTION 'Routine configuration drift: %',fn.ident; END IF;
 END LOOP;
 FOR fn IN SELECT * FROM jsonb_to_recordset(expected_functions)
         AS x(oid integer,md5 text,lang_oid integer,definer boolean,config text)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=fn.oid::oid
       AND md5(p.prosrc)=fn.md5 AND p.prolang=fn.lang_oid::oid
       AND p.prosecdef=fn.definer AND p.proconfig::text=fn.config
       AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Qualified routine source changed: %',fn.oid; END IF;
 END LOOP;

 FOR rel IN SELECT * FROM jsonb_to_recordset(snapshot) AS rel(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer,expected_rows integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',rel.name);
 END LOOP;

 -- Rewrite only the five routine definitions explicitly naming the old
 -- three tables. CREATE OR REPLACE retains function identity and grants.
 FOR fn IN SELECT * FROM jsonb_to_recordset(expected_functions)
         AS x(oid integer,md5 text,lang_oid integer,definer boolean,config text)
 LOOP
   definition:=pg_get_functiondef(fn.oid::oid);
   updated_definition:=definition;
   FOR rel IN SELECT * FROM jsonb_to_recordset(snapshot) AS rel(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer,expected_rows integer) LOOP
     updated_definition:=replace(updated_definition,
         format('education_v30.%I',rel.name),format('public.%I',rel.name));
   END LOOP;
   IF updated_definition=definition THEN
     RAISE EXCEPTION 'Expected explicit schema replacements for routine %',fn.oid;
   END IF;
   EXECUTE updated_definition;
   altered_routines:=altered_routines+1;
 END LOOP;

 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident,p.proconfig
      FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS needle(value) ON p.prosrc ILIKE '%'||(needle.value->>'name')||'%'
      WHERE p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
 LOOP
   EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',fn.ident);
   rebound:=rebound+1;
 END LOOP;

 FOR rel IN SELECT * FROM jsonb_to_recordset(snapshot) AS rel(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer,expected_rows integer) LOOP
   obj:=to_regclass(format('public.%I',rel.name));
   IF obj IS DISTINCT FROM rel.oid::oid
     OR to_regclass(format('education_v30.%I',rel.name)) IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
       AND c.relrowsecurity=rel.rls AND c.relforcerowsecurity=rel.forced
       AND c.relacl::text IS NOT DISTINCT FROM rel.acl)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>rel.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>rel.trg
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=obj)<>rel.outf
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>rel.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>rel.idx
   THEN RAISE EXCEPTION 'Postflight structural change: %',rel.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',rel.name) INTO row_count;
   IF row_count<>rel.expected_rows THEN
     RAISE EXCEPTION 'Postflight data mismatch: %',rel.name;
   END IF;
 END LOOP;
 FOR fn IN SELECT * FROM jsonb_to_recordset(expected_functions)
         AS x(oid integer,md5 text,lang_oid integer,definer boolean,config text)
 LOOP
   IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=fn.oid::oid
       AND md5(p.prosrc)<>fn.md5 AND p.prosecdef=fn.definer
       AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Routine replacement did not retain identity: %',fn.oid; END IF;
   IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=fn.oid::oid
      AND (p.prosrc ILIKE '%education_v30.course_versions%'
       OR p.prosrc ILIKE '%education_v30.course_lessons%'
       OR p.prosrc ILIKE '%education_v30.offering_courses%'))
   THEN RAISE EXCEPTION 'Unretired qualified table reference in routine %',fn.oid; END IF;
 END LOOP;
 RAISE NOTICE 'Moved 3 populated tables; rewrote % qualified routines, rebound % search paths',altered_routines,rebound;
END $cutover$;