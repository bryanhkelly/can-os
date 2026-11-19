-- CAN OS single-schema retirement: 10 native Course/Offering/Deployment tables
-- Neon project sweet-hall-62441909, production branch main.
-- 6 tables contain records: preserve all rows and original table identity/OID.
-- Drizzle plus main runtime SQL callers moved to public first.
-- One guarded atomic operation; no CREATE TABLE, DROP, CASCADE or copy.
DO $migrate$
DECLARE
 snapshot jsonb := '[{"name":"class_offering_versions","oid":541898,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":2,"inf":4,"idx":4,"expected_rows":0},{"name":"course_units","oid":403497,"rls":false,"forced":false,"acl":null,"pol":0,"trg":1,"outf":1,"inf":5,"idx":3,"expected_rows":2},{"name":"courses","oid":403451,"rls":false,"forced":false,"acl":null,"pol":0,"trg":0,"outf":1,"inf":6,"idx":2,"expected_rows":1},{"name":"noncredit_self_enrollment_releases","oid":524328,"rls":true,"forced":true,"acl":null,"pol":1,"trg":1,"outf":9,"inf":4,"idx":5,"expected_rows":0},{"name":"offering_release_requirements","oid":404597,"rls":false,"forced":false,"acl":null,"pol":0,"trg":1,"outf":1,"inf":0,"idx":2,"expected_rows":0},{"name":"offering_versions","oid":403399,"rls":true,"forced":true,"acl":null,"pol":3,"trg":2,"outf":1,"inf":16,"idx":3,"expected_rows":1},{"name":"offerings","oid":403352,"rls":true,"forced":true,"acl":null,"pol":3,"trg":0,"outf":1,"inf":12,"idx":3,"expected_rows":1},{"name":"program_deployments","oid":404673,"rls":true,"forced":true,"acl":null,"pol":3,"trg":0,"outf":2,"inf":56,"idx":6,"expected_rows":1},{"name":"qualification_applications","oid":416987,"rls":true,"forced":true,"acl":null,"pol":2,"trg":1,"outf":7,"inf":11,"idx":12,"expected_rows":0},{"name":"service_capabilities","oid":402887,"rls":false,"forced":false,"acl":null,"pol":0,"trg":0,"outf":1,"inf":8,"idx":3,"expected_rows":13}]'::jsonb;
 t record; fn record; source_oid oid; n bigint;
 routine_count integer; changed integer := 0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'CAN OS Neon production main required'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Unsafe SECURITY DEFINER public fallback'; END IF;
 IF jsonb_array_length(snapshot)<>10
 THEN RAISE EXCEPTION 'Migration snapshot requires 10 tables'; END IF;

 FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer,expected_rows integer) LOOP
   source_oid:=to_regclass(format('education_v30.%I',t.name));
   IF source_oid IS DISTINCT FROM t.oid::oid
      OR to_regclass(format('public.%I',t.name)) IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=source_oid
           AND c.relkind='r'
           AND c.relrowsecurity=t.rls AND c.relforcerowsecurity=t.forced
           AND c.relacl::text IS NOT DISTINCT FROM t.acl)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=source_oid)<>t.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=source_oid AND NOT tgisinternal)<>t.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=source_oid)<>t.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=source_oid)<>t.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=source_oid)<>t.idx
      OR EXISTS (SELECT 1 FROM pg_proc f WHERE f.prosrc ILIKE '%education_v30.'||t.name||'%')
      OR EXISTS (SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||t.name||'%')
      OR EXISTS (SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
        WHERE i.indrelid=source_oid
        AND EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ix.relname))
      OR has_table_privilege('authenticated',source_oid,'SELECT')
      OR has_table_privilege('authenticated',source_oid,'INSERT')
      OR has_table_privilege('authenticated',source_oid,'UPDATE')
      OR has_table_privilege('authenticated',source_oid,'DELETE')
   THEN RAISE EXCEPTION 'Source metadata/security collision: %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',t.name) INTO n;
   IF n<>t.expected_rows
   THEN RAISE EXCEPTION 'Source row count changed for %: expected %, got %',t.name,t.expected_rows,n; END IF;
 END LOOP;

 SELECT count(DISTINCT f.oid)::int INTO routine_count FROM pg_proc f JOIN jsonb_array_elements(snapshot) AS ref(item) ON f.prosrc ILIKE '%'||(ref.item->>'name')||'%';
 IF routine_count<>60
 THEN RAISE EXCEPTION 'Stored routine dependency drift: expected 60, got %',routine_count; END IF;
 FOR fn IN SELECT DISTINCT f.oid,f.oid::regprocedure AS ident,
     f.proconfig,f.prosecdef,pg_get_userbyid(f.proowner) AS owner,
     ns.nspname AS namespace
   FROM pg_proc f JOIN pg_namespace ns ON ns.oid=f.pronamespace
   JOIN jsonb_array_elements(snapshot) AS ref(item) ON f.prosrc ILIKE '%'||(ref.item->>'name')||'%'
 LOOP
   IF fn.owner<>'neondb_owner' OR fn.namespace<>'education_v30'
      OR (fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
      AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
      AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, education_v30, public, pg_temp']::text[])
   THEN RAISE EXCEPTION 'Stored routine ownership/search_path mismatch: %',fn.ident; END IF;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer,expected_rows integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',t.name);
 END LOOP;
 FOR fn IN SELECT DISTINCT f.oid,f.oid::regprocedure AS ident
   FROM pg_proc f JOIN jsonb_array_elements(snapshot) AS ref(item) ON f.prosrc ILIKE '%'||(ref.item->>'name')||'%'
   WHERE f.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
 LOOP
   EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',fn.ident);
   changed:=changed+1;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer,expected_rows integer) LOOP
   source_oid:=to_regclass(format('public.%I',t.name));
   IF source_oid IS DISTINCT FROM t.oid::oid
      OR to_regclass(format('education_v30.%I',t.name)) IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=source_oid
        AND c.relkind='r'
        AND c.relrowsecurity=t.rls AND c.relforcerowsecurity=t.forced
        AND c.relacl::text IS NOT DISTINCT FROM t.acl)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=source_oid)<>t.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=source_oid AND NOT tgisinternal)<>t.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=source_oid)<>t.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=source_oid)<>t.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=source_oid)<>t.idx
      OR has_table_privilege('authenticated',source_oid,'SELECT')
      OR has_table_privilege('authenticated',source_oid,'INSERT')
      OR has_table_privilege('authenticated',source_oid,'UPDATE')
      OR has_table_privilege('authenticated',source_oid,'DELETE')
   THEN RAISE EXCEPTION 'Postflight mismatch after moving %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',t.name) INTO n;
   IF n<>t.expected_rows
   THEN RAISE EXCEPTION 'Postflight row preservation failed: %',t.name; END IF;
 END LOOP;
 RAISE NOTICE 'Moved 10 Course/Offering tables retaining all existing records and rebound % routines',changed;
END $migrate$;