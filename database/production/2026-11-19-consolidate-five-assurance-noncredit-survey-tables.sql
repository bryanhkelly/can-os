-- CAN OS production Neon main: five empty assurance, sensitive approval,
-- noncredit and survey tables. Restrict ACLs and preserve FORCE RLS.
-- Rebind five explicitly-qualified routines, including secure-schema routine.
-- No copy, bridge, drop or CASCADE; one atomic guarded transaction.
DO $cutover$
DECLARE
 tables jsonb:='[{"name":"assurance_cases","oid":412529,"rls":true,"forced":true,"acl":null,"pol":1,"trg":1,"outf":5,"inf":8,"idx":7},{"name":"canonical_sensitive_capability_approvals","oid":542825,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner,can_v30_sensitive_approval_writer=arw/neondb_owner}","pol":4,"trg":0,"outf":4,"inf":0,"idx":3},{"name":"noncredit_self_enrollment_claims","oid":524413,"rls":true,"forced":true,"acl":null,"pol":1,"trg":3,"outf":6,"inf":0,"idx":5},{"name":"noncredit_training_versions","oid":414715,"rls":false,"forced":false,"acl":null,"pol":0,"trg":1,"outf":6,"inf":5,"idx":7},{"name":"survey_questions","oid":411982,"rls":true,"forced":true,"acl":null,"pol":2,"trg":1,"outf":1,"inf":6,"idx":4}]'::jsonb;
 routines jsonb:='[{"oid":413542,"hash":"f45f0f52035eae17ae23030d7bc2e2ea","lang":13627,"definer":true,"config":"{\"search_path=education_v30, education_v30_secure, pg_catalog\"}","namespace_oid":402172},{"oid":413549,"hash":"b6110296fe15773a7f64be2c4d6a6372","lang":13627,"definer":false,"config":"{\"search_path=education_v30_secure, education_v30, pg_catalog\"}","namespace_oid":412796},{"oid":524562,"hash":"4515d496ce9ef5423dd091999d59b6af","lang":13627,"definer":false,"config":null,"namespace_oid":402172},{"oid":542872,"hash":"17b8301708a23864169b1c6067617e83","lang":14,"definer":true,"config":"{\"search_path=pg_catalog, pg_temp\"}","namespace_oid":402172},{"oid":542963,"hash":"bbbc465932753b7e8e55d996f896fb8a","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}","namespace_oid":402172}]'::jsonb;
 t record; f record; obj oid; n bigint; dep_count integer;
 before text; after text; replaced integer:=0; rebound integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Refusing cutover outside CAN OS main'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public schema must not be writable by authenticated'; END IF;
 IF jsonb_array_length(tables)<>5 OR jsonb_array_length(routines)<>5
 THEN RAISE EXCEPTION 'Unexpected snapshot size'; END IF;

 FOR t IN SELECT * FROM jsonb_to_recordset(tables) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   obj:=to_regclass(format('education_v30.%I',t.name));
   IF obj IS DISTINCT FROM t.oid::oid
      OR to_regclass(format('public.%I',t.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
         AND c.relrowsecurity=t.rls AND c.relforcerowsecurity=t.forced
         AND c.relacl::text IS NOT DISTINCT FROM t.acl)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>t.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>t.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=obj)<>t.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>t.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>t.idx
      OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||t.name||'%')
      OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
          WHERE i.indrelid=obj AND EXISTS(SELECT 1 FROM pg_class d
           WHERE d.relnamespace='public'::regnamespace AND d.relname=ix.relname))
      OR has_table_privilege('authenticated',obj,'SELECT')
      OR has_table_privilege('authenticated',obj,'INSERT')
      OR has_table_privilege('authenticated',obj,'UPDATE')
      OR has_table_privilege('authenticated',obj,'DELETE')
   THEN RAISE EXCEPTION 'Preflight metadata/security drift: %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',t.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Source has rows: %',t.name; END IF;
 END LOOP;
 SELECT count(DISTINCT p.oid)::int INTO dep_count FROM pg_proc p JOIN jsonb_array_elements(tables) AS lookup(value) ON p.prosrc ILIKE '%'||(lookup.value->>'name')||'%';
 IF dep_count<>21 THEN RAISE EXCEPTION 'Unexpected stored routine set: %',dep_count; END IF;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS identity,p.proconfig,p.prosecdef,
    pg_get_userbyid(p.proowner) owner,n.nspname AS ns
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN jsonb_array_elements(tables) AS lookup(value)
      ON p.prosrc ILIKE '%'||(lookup.value->>'name')||'%'
 LOOP
   IF f.owner<>'neondb_owner' OR f.ns NOT IN ('education_v30','education_v30_secure')
    OR (f.proconfig IS NOT NULL AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
      AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
      AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
      AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public, pg_temp']::text[]
      AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, education_v30_secure, pg_catalog']::text[]
      AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30_secure, education_v30, pg_catalog']::text[]
      AND f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']::text[])
   THEN RAISE EXCEPTION 'Unexpected routine configuration: %',f.identity; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(routines)
    AS x(oid integer,hash text,lang integer,definer boolean,config text,namespace_oid integer)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
     AND md5(p.prosrc)=f.hash AND p.prolang=f.lang::oid
     AND p.prosecdef=f.definer AND p.proconfig::text IS NOT DISTINCT FROM f.config
     AND p.pronamespace=f.namespace_oid::oid AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Qualified function body/config changed: %',f.oid; END IF;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(tables) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',t.name);
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(routines)
     AS x(oid integer,hash text,lang integer,definer boolean,config text,namespace_oid integer)
 LOOP
   before:=pg_get_functiondef(f.oid::oid);
   after:=before;
   FOR t IN SELECT * FROM jsonb_to_recordset(tables) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
     after:=replace(after,format('education_v30.%I',t.name),format('public.%I',t.name));
   END LOOP;
   IF before=after THEN RAISE EXCEPTION 'No qualified reference found in routine %',f.oid; END IF;
   EXECUTE after;
   replaced:=replaced+1;
 END LOOP;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS identity,p.proconfig
     FROM pg_proc p JOIN jsonb_array_elements(tables) AS lookup(value) ON p.prosrc ILIKE '%'||(lookup.value->>'name')||'%'
 LOOP
   IF f.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',f.identity);
     rebound:=rebound+1;
   ELSIF f.proconfig=ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public, pg_temp',f.identity);
     rebound:=rebound+1;
   ELSIF f.proconfig=ARRAY['search_path=education_v30, education_v30_secure, pg_catalog']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, education_v30_secure, pg_catalog, public, pg_temp',f.identity);
     rebound:=rebound+1;
   ELSIF f.proconfig=ARRAY['search_path=education_v30_secure, education_v30, pg_catalog']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30_secure, education_v30, pg_catalog, public',f.identity);
     rebound:=rebound+1;
   END IF;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(tables) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   obj:=to_regclass(format('public.%I',t.name));
   IF obj IS DISTINCT FROM t.oid::oid
      OR to_regclass(format('education_v30.%I',t.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
          AND c.relrowsecurity=t.rls AND c.relforcerowsecurity=t.forced
          AND c.relacl::text IS NOT DISTINCT FROM t.acl)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>t.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>t.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=obj)<>t.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>t.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>t.idx
   THEN RAISE EXCEPTION 'Postflight metadata/security mismatch %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',t.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Unexpected migrated rows %',t.name; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(routines)
    AS x(oid integer,hash text,lang integer,definer boolean,config text,namespace_oid integer)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
        AND md5(p.prosrc)<>f.hash AND p.prosecdef=f.definer
        AND p.pronamespace=f.namespace_oid::oid AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Function identity not preserved %',f.oid; END IF;
   IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid AND EXISTS(
       SELECT 1 FROM jsonb_array_elements(tables) AS lookup(v)
       WHERE p.prosrc ILIKE '%education_v30.'||(lookup.v->>'name')||'%'))
   THEN RAISE EXCEPTION 'Old schema still referenced by function %',f.oid; END IF;
 END LOOP;
 RAISE NOTICE 'Moved 5 assurance/noncredit/survey tables, rewrote % funcs and rebound % paths',replaced,rebound;
END $cutover$;