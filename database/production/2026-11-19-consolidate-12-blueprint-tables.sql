-- CAN OS Blueprint cutover | Neon main | twelve empty tables, OIDs preserved.
-- See src/db/canonical-v301/blueprints.ts: all twelve map directly to pgTable.
-- No duplicates, DROP, CASCADE, compatibility views or bridge tables.
-- Guarded transaction preserves foreign keys, RLS, policies, triggers, ACLs,
-- and both caller and routine identities. Legacy-first stored routines retain
-- old precedence but may resolve the moved objects through public.
DO $cutover$
DECLARE snapshot jsonb:='[{"name":"blueprint_component_approval_decisions","oid":403849,"rls":true,"force_rls":true,"pol":3,"trg":2,"outf":4,"inf":0,"idx":6},{"name":"blueprint_components","oid":403072,"rls":true,"force_rls":true,"pol":2,"trg":1,"outf":1,"inf":5,"idx":3},{"name":"blueprint_configuration_component_references","oid":403300,"rls":true,"force_rls":true,"pol":3,"trg":1,"outf":2,"inf":0,"idx":2},{"name":"blueprint_configuration_components","oid":403193,"rls":true,"force_rls":true,"pol":3,"trg":1,"outf":2,"inf":4,"idx":3},{"name":"blueprint_configuration_local_experiences","oid":403217,"rls":true,"force_rls":true,"pol":3,"trg":1,"outf":1,"inf":0,"idx":2},{"name":"blueprint_configuration_offering_intents","oid":403428,"rls":true,"force_rls":true,"pol":3,"trg":1,"outf":2,"inf":0,"idx":2},{"name":"blueprint_configuration_versions","oid":403146,"rls":true,"force_rls":true,"pol":4,"trg":1,"outf":3,"inf":6,"idx":7},{"name":"blueprint_configurations","oid":403121,"rls":true,"force_rls":true,"pol":3,"trg":0,"outf":2,"inf":1,"idx":4},{"name":"blueprint_execution_batches","oid":403890,"rls":true,"force_rls":true,"pol":4,"trg":1,"outf":4,"inf":2,"idx":6},{"name":"blueprint_outputs","oid":404707,"rls":true,"force_rls":true,"pol":3,"trg":3,"outf":8,"inf":0,"idx":11},{"name":"blueprint_versions","oid":403040,"rls":true,"force_rls":true,"pol":2,"trg":1,"outf":1,"inf":4,"idx":3},{"name":"configuration_reviews","oid":403318,"rls":true,"force_rls":true,"pol":3,"trg":1,"outf":3,"inf":2,"idx":5}]'::jsonb; item record; f record; rel oid; n bigint; rebound int:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Wrong production database'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public must not be schema-writable by authenticated'; END IF;
 IF jsonb_array_length(snapshot)<>12 THEN RAISE EXCEPTION 'Expected twelve tables'; END IF;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,force_rls boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   rel:=to_regclass(format('education_v30.%I',item.name));
   IF rel IS DISTINCT FROM item.oid::oid
     OR to_regclass(format('public.%I',item.name)) IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
       AND c.relacl IS NULL AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.force_rls)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>item.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>item.trg
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=rel AND contype='f')<>item.outf
     OR (SELECT count(*) FROM pg_constraint WHERE confrelid=rel AND contype='f')<>item.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>item.idx
     OR EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%'||item.name||'%')
     OR EXISTS(SELECT 1 FROM pg_proc WHERE prosrc ILIKE '%education_v30.'||item.name||'%')
     OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid WHERE i.indrelid=rel
       AND EXISTS(SELECT 1 FROM pg_class dst WHERE dst.relnamespace='public'::regnamespace
         AND dst.relname=ix.relname))
     OR has_table_privilege('authenticated',rel,'SELECT')
     OR has_table_privilege('authenticated',rel,'INSERT')
     OR has_table_privilege('authenticated',rel,'UPDATE')
     OR has_table_privilege('authenticated',rel,'DELETE')
   THEN RAISE EXCEPTION 'Blueprint table preflight mismatch: %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Blueprint table % no longer empty',item.name; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT p.oid) FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS d(j)
   ON p.prosrc ILIKE '%'||(d.j->>'name')||'%')<>7
 THEN RAISE EXCEPTION 'Blueprint function dependency inventory changed'; END IF;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident,p.proconfig,
     pg_get_userbyid(p.proowner) AS owner,ns.nspname AS ns
     FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     JOIN jsonb_array_elements(snapshot) AS d(j)
       ON p.prosrc ILIKE '%'||(d.j->>'name')||'%'
 LOOP
   IF f.owner<>'neondb_owner' OR f.ns<>'education_v30'
      OR (f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
      AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[])
   THEN RAISE EXCEPTION 'Unsafe Blueprint function: %',f.ident; END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,force_rls boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',item.name);
 END LOOP;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident
     FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS d(j)
       ON p.prosrc ILIKE '%'||(d.j->>'name')||'%'
     WHERE p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
 LOOP
   EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',f.ident);
   rebound:=rebound+1;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS x(name text,oid integer,rls boolean,force_rls boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   rel:=to_regclass(format('public.%I',item.name));
   IF rel IS DISTINCT FROM item.oid::oid
     OR to_regclass(format('education_v30.%I',item.name)) IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
       AND c.relacl IS NULL AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.force_rls)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>item.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>item.trg
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=rel AND contype='f')<>item.outf
     OR (SELECT count(*) FROM pg_constraint WHERE confrelid=rel AND contype='f')<>item.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>item.idx
   THEN RAISE EXCEPTION 'Blueprint postflight mismatch: %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',item.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Blueprint migrated records changed %',item.name; END IF;
 END LOOP;
 RAISE NOTICE 'Twelve Blueprint tables moved; % routines rebound',rebound;
END $cutover$;