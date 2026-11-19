-- CAN OS | Neon main content, evidence, professional roles, readiness
-- Ten empty relations moved by OID-preserving schema changes.
-- DB objects, RLS, policies, triggers, index identities, and FKs retained.
-- No bridge, duplicate, data copy, DROP or CASCADE.
DO $batch$
DECLARE snapshot jsonb := '[{"name":"content_asset_versions","oid":403560,"rls":false,"forced":false,"pol":0,"trg":1,"outf":1,"inf":19,"idx":2},{"name":"content_manifest_review_decisions","oid":411889,"rls":true,"forced":true,"pol":1,"trg":2,"outf":3,"inf":0,"idx":5},{"name":"content_publication_manifest_items","oid":411856,"rls":true,"forced":true,"pol":1,"trg":2,"outf":3,"inf":0,"idx":4},{"name":"content_publication_manifests","oid":411810,"rls":true,"forced":true,"pol":1,"trg":1,"outf":5,"inf":2,"idx":7},{"name":"content_withdrawals","oid":403778,"rls":true,"forced":true,"pol":1,"trg":1,"outf":5,"inf":0,"idx":6},{"name":"deployment_readiness_reviews","oid":416402,"rls":true,"forced":true,"pol":1,"trg":1,"outf":5,"inf":4,"idx":6},{"name":"education_operation_organization_roles","oid":402429,"rls":true,"forced":true,"pol":2,"trg":0,"outf":3,"inf":1,"idx":5},{"name":"formative_practice_attempts","oid":405591,"rls":true,"forced":true,"pol":2,"trg":2,"outf":4,"inf":1,"idx":6},{"name":"professional_capability_authorizations","oid":403935,"rls":true,"forced":true,"pol":1,"trg":0,"outf":9,"inf":3,"idx":11},{"name":"professional_role_assignments","oid":405265,"rls":true,"forced":true,"pol":1,"trg":0,"outf":11,"inf":4,"idx":13}]'::jsonb; item record; fn record; rel oid; n bigint; nfunc integer; rebound integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'CAN OS Neon main required'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public CREATE is not allowed for guarded routine fallback'; END IF;
 IF jsonb_array_length(snapshot)<>10 THEN RAISE EXCEPTION 'Wrong snapshot cardinality'; END IF;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS item(name text,oid integer,rls boolean,forced boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
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
      OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||item.name||'%')
      OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%education_v30.'||item.name||'%')
      OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid WHERE i.indrelid=rel
        AND EXISTS(SELECT 1 FROM pg_class dst WHERE dst.relnamespace='public'::regnamespace AND dst.relname=ix.relname))
      OR has_table_privilege('authenticated',rel,'SELECT')
      OR has_table_privilege('authenticated',rel,'INSERT')
      OR has_table_privilege('authenticated',rel,'UPDATE')
      OR has_table_privilege('authenticated',rel,'DELETE')
   THEN RAISE EXCEPTION 'Preflight metadata or security mismatch %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Expected empty source: %',item.name; END IF;
 END LOOP;
 SELECT count(DISTINCT p.oid)::int INTO nfunc FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS dep(value) ON p.prosrc ILIKE '%'||(dep.value->>'name')||'%';
 IF nfunc<>29 THEN RAISE EXCEPTION 'Routine count changed, expected 29 got %',nfunc; END IF;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS id,p.proconfig,p.prosecdef,
     pg_get_userbyid(p.proowner) AS owner,ns.nspname AS namespace
     FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace JOIN jsonb_array_elements(snapshot) AS dep(value) ON p.prosrc ILIKE '%'||(dep.value->>'name')||'%'
 LOOP
   IF fn.owner<>'neondb_owner' OR fn.namespace<>'education_v30'
      OR (fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
        AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
        AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
        AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[])
   THEN RAISE EXCEPTION 'Unexpected dependent routine %',fn.id; END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS item(name text,oid integer,rls boolean,forced boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',item.name);
 END LOOP;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS id,p.proconfig
    FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS dep(value) ON p.prosrc ILIKE '%'||(dep.value->>'name')||'%'
 LOOP
   IF fn.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',fn.id);
     rebound:=rebound+1;
   ELSIF fn.proconfig=ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public, pg_temp',fn.id);
     rebound:=rebound+1;
   ELSIF fn.proconfig=ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog, education_v30, public, pg_temp',fn.id);
     rebound:=rebound+1;
   END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS item(name text,oid integer,rls boolean,forced boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
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
   THEN RAISE EXCEPTION 'Postflight mismatch %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',item.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Unexpected data on moved table %',item.name; END IF;
 END LOOP;
 RAISE NOTICE 'Moved 10 content/professional tables; rebound % routines',rebound;
END $batch$;