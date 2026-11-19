-- CAN OS Neon main: eight empty assessment/grading supporting relations.
-- OID-preserving, single transaction, zero drops, no bridges.
-- Rebind both legacy-first and pg_catalog-first fixed routine search paths.
DO $cutover$
DECLARE
 snapshot jsonb := '[{"name":"assessment_form_review_decisions","oid":406579,"rls":false,"force_rls":false,"pol":0,"trg":1,"outf":2,"inf":0,"idx":4},{"name":"assessment_forms","oid":406458,"rls":false,"force_rls":false,"pol":0,"trg":0,"outf":1,"inf":1,"idx":3},{"name":"assessment_item_banks","oid":406038,"rls":false,"force_rls":false,"pol":0,"trg":0,"outf":1,"inf":1,"idx":2},{"name":"assessment_item_review_decisions","oid":406426,"rls":false,"force_rls":false,"pol":0,"trg":1,"outf":2,"inf":0,"idx":4},{"name":"assessment_items","oid":406063,"rls":false,"force_rls":false,"pol":0,"trg":0,"outf":2,"inf":1,"idx":4},{"name":"assessment_version_review_decisions","oid":406006,"rls":false,"force_rls":false,"pol":0,"trg":1,"outf":2,"inf":0,"idx":4},{"name":"graded_submissions","oid":405813,"rls":true,"force_rls":true,"pol":1,"trg":0,"outf":2,"inf":2,"idx":5},{"name":"official_course_grades","oid":405844,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":5,"inf":2,"idx":8}]'::jsonb;
 item record; fn record; rel oid; n bigint; changed integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'This migration requires CAN OS Neon main'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE') THEN
   RAISE EXCEPTION 'Public schema must not be writable by authenticated'; END IF;
 IF jsonb_array_length(snapshot)<>8 THEN RAISE EXCEPTION 'Invalid snapshot length'; END IF;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS t(name text,oid integer,rls boolean,force_rls boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   rel:=to_regclass(format('education_v30.%I',item.name));
   IF rel IS DISTINCT FROM item.oid::oid
      OR to_regclass(format('public.%I',item.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
        AND c.relacl IS NULL AND c.relrowsecurity=item.rls
        AND c.relforcerowsecurity=item.force_rls)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>item.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>item.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=rel)<>item.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=rel)<>item.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>item.idx
      OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||item.name||'%')
      OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%education_v30.'||item.name||'%')
      OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
         WHERE i.indrelid=rel AND EXISTS(SELECT 1 FROM pg_class pub
           WHERE pub.relnamespace='public'::regnamespace AND pub.relname=ix.relname))
      OR has_table_privilege('authenticated',rel,'SELECT')
      OR has_table_privilege('authenticated',rel,'INSERT')
      OR has_table_privilege('authenticated',rel,'UPDATE')
      OR has_table_privilege('authenticated',rel,'DELETE')
   THEN RAISE EXCEPTION 'Preflight failed for %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Nonempty table %',item.name; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT p.oid) FROM pg_proc p
       JOIN jsonb_array_elements(snapshot) AS dep(j)
         ON p.prosrc ILIKE '%'||(dep.j->>'name')||'%')<>11
 THEN RAISE EXCEPTION 'Dependent routine inventory changed'; END IF;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS proc,p.proconfig,
     p.prosecdef,pg_get_userbyid(p.proowner) AS owner,ns.nspname AS fn_schema
     FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     JOIN jsonb_array_elements(snapshot) AS dep(j)
       ON p.prosrc ILIKE '%'||(dep.j->>'name')||'%'
 LOOP
    IF fn.owner<>'neondb_owner' OR fn.fn_schema<>'education_v30'
      OR (fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
      AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
      AND (NOT fn.prosecdef OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[]))
    THEN RAISE EXCEPTION 'Unsafe function search path %',fn.proc; END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS t(name text,oid integer,rls boolean,force_rls boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',item.name);
 END LOOP;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS proc,p.proconfig
    FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS dep(j)
      ON p.prosrc ILIKE '%'||(dep.j->>'name')||'%'
 LOOP
    IF fn.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
    THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',fn.proc); changed:=changed+1;
    ELSIF fn.proconfig=ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[]
    THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog, education_v30, public, pg_temp',fn.proc); changed:=changed+1; END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS t(name text,oid integer,rls boolean,force_rls boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   rel:=to_regclass(format('public.%I',item.name));
   IF rel IS DISTINCT FROM item.oid::oid
     OR to_regclass(format('education_v30.%I',item.name)) IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
       AND c.relacl IS NULL AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.force_rls)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>item.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>item.trg
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=rel)<>item.outf
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=rel)<>item.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>item.idx
   THEN RAISE EXCEPTION 'Postflight metadata mismatch %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',item.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Unexpected migrated row count %',item.name; END IF;
 END LOOP;
 RAISE NOTICE 'Moved 8 tables and rebound % database routines',changed;
END $cutover$;