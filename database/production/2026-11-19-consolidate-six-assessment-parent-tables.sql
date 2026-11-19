-- CAN OS Neon main | six empty assessment-parent tables.
-- Existing Drizzle models point to public. Rebind 3 explicitly qualified
-- SQL/PLPGSQL functions and other dependent routine search paths.
-- Single transaction, preserving every table/function OID, security policy,
-- trigger, FK, index and ACL. No shadow, bridge, DROP, CASCADE or data copy.
DO $cutover$
DECLARE
 snapshot jsonb:='[{"name":"assessment_access_grants","oid":406673,"rls":true,"forced":true,"acl":null,"pol":1,"trg":1,"outf":5,"inf":2,"idx":7},{"name":"assessment_administrations","oid":406609,"rls":false,"forced":false,"acl":null,"pol":0,"trg":2,"outf":6,"inf":3,"idx":9},{"name":"assessment_attempt_results","oid":407019,"rls":true,"forced":true,"acl":null,"pol":1,"trg":2,"outf":3,"inf":5,"idx":6},{"name":"assessment_attempts","oid":406762,"rls":true,"forced":true,"acl":null,"pol":1,"trg":3,"outf":3,"inf":4,"idx":9},{"name":"assessment_definitions","oid":405626,"rls":false,"forced":false,"acl":null,"pol":0,"trg":0,"outf":2,"inf":2,"idx":4},{"name":"assessment_versions","oid":405658,"rls":false,"forced":false,"acl":null,"pol":0,"trg":3,"outf":2,"inf":8,"idx":5}]'::jsonb;
 explicit_routines jsonb:='[{"oid":543168,"hash":"1742e9ab08a564adc577158c48db9358","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543171,"hash":"e62c5223faa4694156bd75dbe965f9fe","lang":14,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543211,"hash":"89a8f47f559ccc771edb48ca4d0d92c8","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"}]'::jsonb;
 t record; f record; relation oid; rows bigint; before text; after text;
 func_count integer; rewritten integer:=0; rebound integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Wrong database; main required'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Untrusted public CREATE is unsafe for SECURITY DEFINER'; END IF;
 IF jsonb_array_length(snapshot)<>6 OR jsonb_array_length(explicit_routines)<>3
 THEN RAISE EXCEPTION 'Incorrect assessment inventory'; END IF;
 FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   relation:=to_regclass(format('education_v30.%I',t.name));
   IF relation IS DISTINCT FROM t.oid::oid
      OR to_regclass(format('public.%I',t.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=relation
        AND c.relkind='r' AND c.relrowsecurity=t.rls AND c.relforcerowsecurity=t.forced
        AND c.relacl::text IS NOT DISTINCT FROM t.acl)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=relation)<>t.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=relation AND NOT tgisinternal)<>t.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=relation)<>t.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=relation)<>t.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=relation)<>t.idx
      OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||t.name||'%')
      OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
       WHERE i.indrelid=relation AND EXISTS(SELECT 1 FROM pg_class pub
         WHERE pub.relnamespace='public'::regnamespace AND pub.relname=ix.relname))
      OR has_table_privilege('authenticated',relation,'SELECT')
      OR has_table_privilege('authenticated',relation,'INSERT')
      OR has_table_privilege('authenticated',relation,'UPDATE')
      OR has_table_privilege('authenticated',relation,'DELETE')
   THEN RAISE EXCEPTION 'Preflight table security or dependency drift: %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',t.name) INTO rows;
   IF rows<>0 THEN RAISE EXCEPTION 'Source is nonempty: %',t.name; END IF;
 END LOOP;
 SELECT count(DISTINCT p.oid)::int INTO func_count FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS needle(v) ON p.prosrc ILIKE '%'||(needle.v->>'name')||'%';
 IF func_count<>33 THEN RAISE EXCEPTION 'Expected 33 related routines; found %',func_count; END IF;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS id,p.proconfig,p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner,n.nspname AS ns
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN jsonb_array_elements(snapshot) AS needle(v) ON p.prosrc ILIKE '%'||(needle.v->>'name')||'%'
 LOOP
   IF f.owner<>'neondb_owner' OR f.ns<>'education_v30'
      OR (f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
       AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
       AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public, pg_temp']::text[]
       AND f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, education_v30, public, pg_temp']::text[])
   THEN RAISE EXCEPTION 'Unexpected dependent routine configuration: %',f.id; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(explicit_routines)
      AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
     AND md5(p.prosrc)=f.hash AND p.prolang=f.lang::oid
     AND p.prosecdef=f.definer AND p.proconfig::text=f.config
     AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Explicit function drift: %',f.oid; END IF;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',t.name);
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(explicit_routines)
      AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   before:=pg_get_functiondef(f.oid::oid);
   after:=before;
   FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
     after:=replace(after,format('education_v30.%I',t.name),format('public.%I',t.name));
   END LOOP;
   IF after=before THEN RAISE EXCEPTION 'Expected a schema-qualifier replacement for %',f.oid; END IF;
   EXECUTE after;
   rewritten:=rewritten+1;
 END LOOP;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS id
      FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS needle(v) ON p.prosrc ILIKE '%'||(needle.v->>'name')||'%'
      WHERE p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
 LOOP
   EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',f.id);
   rebound:=rebound+1;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   relation:=to_regclass(format('public.%I',t.name));
   IF relation IS DISTINCT FROM t.oid::oid
     OR to_regclass(format('education_v30.%I',t.name)) IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=relation AND c.relkind='r'
       AND c.relrowsecurity=t.rls AND c.relforcerowsecurity=t.forced
       AND c.relacl::text IS NOT DISTINCT FROM t.acl)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=relation)<>t.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=relation AND NOT tgisinternal)<>t.trg
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=relation)<>t.outf
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=relation)<>t.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=relation)<>t.idx
   THEN RAISE EXCEPTION 'Postflight table drift: %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',t.name) INTO rows;
   IF rows<>0 THEN RAISE EXCEPTION 'Unexpected assessment records: %',t.name; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(explicit_routines)
      AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid AND md5(p.prosrc)<>f.hash
       AND p.prosecdef=f.definer AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Routine rebind identity mismatch: %',f.oid; END IF;
   IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) AS needle(v)
       WHERE p.prosrc ILIKE '%education_v30.'||(needle.v->>'name')||'%'))
   THEN RAISE EXCEPTION 'Unmigrated qualified assessment dependency: %',f.oid; END IF;
 END LOOP;
 RAISE NOTICE 'Moved 6 assessment tables and rewrote % functions, rebound % function paths',rewritten,rebound;
END $cutover$;