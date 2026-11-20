-- CAN OS Neon production main: four empty view-backed tables.
-- Keep original 5 view OIDs and definitions, which PostgreSQL automatically
-- re-renders with new table schema through catalog-bound dependency OIDs.
-- Preserve table ACL/RLS/FKs/indexes/triggers. No view recreation, bridges,
-- DROP, CASCADE, copying, or change to application data. Atomic transaction.
DO $cutover$
DECLARE
 tables jsonb:='[{"name":"learning_sessions","oid":450560,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":4,"inf":2,"idx":4},{"name":"operation_publication_snapshots","oid":408456,"rls":false,"forced":false,"acl":null,"pol":0,"trg":2,"outf":4,"inf":2,"idx":5},{"name":"operational_authorization_decisions","oid":411520,"rls":true,"forced":true,"acl":null,"pol":1,"trg":4,"outf":9,"inf":4,"idx":12},{"name":"qualification_resource_needs","oid":418472,"rls":true,"forced":true,"acl":null,"pol":1,"trg":1,"outf":4,"inf":4,"idx":3}]'::jsonb;
 views jsonb:='[{"name":"facilitated_room_media_command_evidence","oid":491560},{"name":"facilitated_room_pilot_evidence","oid":483529},{"name":"facilitated_room_pilot_weekly_evidence","oid":483534},{"name":"qualification_resource_need_estimates","oid":418607},{"name":"v301_current_public_program_claims","oid":411640}]'::jsonb;
 t record; fn record; view_row record; obj oid; n bigint; routines integer; rebound integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'CAN OS main required'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public schema CREATE privilege unsafe'; END IF;
 IF jsonb_array_length(tables)<>4 OR jsonb_array_length(views)<>5
 THEN RAISE EXCEPTION 'Pinned table/view inventory changed'; END IF;

 FOR t IN SELECT * FROM jsonb_to_recordset(tables) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   obj:=to_regclass(format('education_v30.%I',t.name));
   IF obj IS DISTINCT FROM t.oid::oid
     OR to_regclass(format('public.%I',t.name)) IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj
        AND c.relkind='r' AND c.relrowsecurity=t.rls
        AND c.relforcerowsecurity=t.forced
        AND c.relacl::text IS NOT DISTINCT FROM t.acl)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>t.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>t.trg
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=obj)<>t.outf
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>t.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>t.idx
     OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
      WHERE i.indrelid=obj AND EXISTS(SELECT 1 FROM pg_class d WHERE d.relnamespace='public'::regnamespace AND d.relname=ix.relname))
     OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%education_v30.'||t.name||'%')
     OR has_table_privilege('authenticated',obj,'SELECT')
     OR has_table_privilege('authenticated',obj,'INSERT')
     OR has_table_privilege('authenticated',obj,'UPDATE')
     OR has_table_privilege('authenticated',obj,'DELETE')
   THEN RAISE EXCEPTION 'View-backed table preflight failed: %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',t.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'View-backed source nonempty: %',t.name; END IF;
 END LOOP;
 FOR view_row IN SELECT * FROM jsonb_to_recordset(views) AS v(name text,oid integer) LOOP
   obj:=to_regclass(format('education_v30.%I',view_row.name));
   IF obj IS DISTINCT FROM view_row.oid::oid
   THEN RAISE EXCEPTION 'Stored view identity changed: %',view_row.name; END IF;
 END LOOP;
 SELECT count(DISTINCT p.oid)::int INTO routines FROM pg_proc p JOIN jsonb_array_elements(tables) AS item(value) ON p.prosrc ILIKE '%'||(item.value->>'name')||'%';
 IF routines<>11 THEN RAISE EXCEPTION 'View-root routine dependencies changed: %',routines; END IF;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS identity,p.proconfig,
    pg_get_userbyid(p.proowner) owner,ns.nspname AS namespace
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace JOIN jsonb_array_elements(tables) AS item(value) ON p.prosrc ILIKE '%'||(item.value->>'name')||'%'
 LOOP
   IF fn.owner<>'neondb_owner' OR fn.namespace<>'education_v30'
     OR (fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
       AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
       AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public, pg_temp']::text[])
   THEN RAISE EXCEPTION 'Unexpected view-root routine %',fn.identity; END IF;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(tables) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',t.name);
 END LOOP;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS identity
   FROM pg_proc p JOIN jsonb_array_elements(tables) AS item(value) ON p.prosrc ILIKE '%'||(item.value->>'name')||'%'
   WHERE p.proconfig=ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
 LOOP
   EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public, pg_temp',fn.identity);
   rebound:=rebound+1;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(tables) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   obj:=to_regclass(format('public.%I',t.name));
   IF obj IS DISTINCT FROM t.oid::oid
     OR to_regclass(format('education_v30.%I',t.name)) IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj
       AND c.relkind='r' AND c.relrowsecurity=t.rls
       AND c.relforcerowsecurity=t.forced
       AND c.relacl::text IS NOT DISTINCT FROM t.acl)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>t.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>t.trg
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=obj)<>t.outf
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>t.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>t.idx
   THEN RAISE EXCEPTION 'View-root postflight mismatch: %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',t.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Unexpected postflight rows: %',t.name; END IF;
 END LOOP;
 FOR view_row IN SELECT * FROM jsonb_to_recordset(views) AS v(name text,oid integer) LOOP
   obj:=to_regclass(format('education_v30.%I',view_row.name));
   IF obj IS DISTINCT FROM view_row.oid::oid
   THEN RAISE EXCEPTION 'View identity lost: %',view_row.name; END IF;
 END LOOP;
 RAISE NOTICE 'Four view-backed tables moved; all five view identities preserved; % routine paths updated',rebound;
END $cutover$;