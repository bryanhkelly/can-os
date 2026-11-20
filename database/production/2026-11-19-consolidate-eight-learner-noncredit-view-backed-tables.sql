-- CAN OS Neon main, coordinated eight-table learner/noncredit/survey cutover
-- Keep all six existing education_v30 view identities; PostgreSQL references
-- the moved tables by unchanged OID and updates view SQL automatically.
-- Rebind exactly five explicitly-qualified function bodies; preserve grants,
-- FORCE RLS, triggers, indexes and FKs in an atomic guarded transaction.
-- NO duplicate tables, bridge, data copy, DROP, or CASCADE.
DO $cutover$
DECLARE
 tables jsonb:='[{"name":"facilitated_learning_sessions","oid":450642,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":5,"inf":12,"idx":5},{"name":"facilitated_room_attendance_assertions","oid":483433,"rls":true,"forced":true,"acl":null,"pol":1,"trg":0,"outf":2,"inf":0,"idx":3},{"name":"learner_course_attempts","oid":405434,"rls":true,"forced":true,"acl":null,"pol":2,"trg":3,"outf":7,"inf":24,"idx":13},{"name":"learner_profiles","oid":402735,"rls":true,"forced":true,"acl":null,"pol":1,"trg":0,"outf":1,"inf":19,"idx":2},{"name":"noncredit_completion_decisions","oid":414915,"rls":true,"forced":true,"acl":null,"pol":1,"trg":2,"outf":6,"inf":5,"idx":8},{"name":"noncredit_registrations","oid":414763,"rls":true,"forced":true,"acl":null,"pol":2,"trg":2,"outf":10,"inf":11,"idx":12},{"name":"survey_campaigns","oid":412109,"rls":true,"forced":true,"acl":null,"pol":1,"trg":2,"outf":9,"inf":8,"idx":11},{"name":"survey_responses","oid":412257,"rls":true,"forced":true,"acl":null,"pol":1,"trg":3,"outf":5,"inf":5,"idx":9}]'::jsonb;
 routines jsonb:='[{"oid":524562,"hash":"60a2064a63e115c192a61e39708a8cd4","lang":13627,"definer":false,"config":null,"ns_oid":402172},{"oid":542183,"hash":"88613264f0d60ef6099e2350dfe1d9e7","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}","ns_oid":402172},{"oid":542963,"hash":"d6793b643eb93753d120fb2a65aa5405","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}","ns_oid":402172},{"oid":543168,"hash":"bb0e78718d6ed94da59b2420db1e071a","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}","ns_oid":402172},{"oid":543171,"hash":"de8597a89f1b14693fc69f8ba55b9b9b","lang":14,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}","ns_oid":402172}]'::jsonb;
 views jsonb:='[{"name":"facilitated_room_media_command_evidence","oid":491560},{"name":"facilitated_room_pilot_evidence","oid":483529},{"name":"facilitated_room_pilot_weekly_evidence","oid":483534},{"name":"learner_longitudinal_outcomes","oid":415009},{"name":"qualification_resource_need_estimates","oid":418607},{"name":"v301_current_public_program_claims","oid":411640}]'::jsonb;
 item record; fn record; v record; obj oid; rows bigint;
 olddef text; newdef text; nfunc integer; changed integer:=0; rebound integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Requires production Neon main'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public schema CREATE must be denied for sensitive routines'; END IF;
 IF jsonb_array_length(tables)<>8 OR jsonb_array_length(routines)<>5 OR jsonb_array_length(views)<>6
 THEN RAISE EXCEPTION 'Wrong table/routine/view inventory'; END IF;
 FOR item IN SELECT * FROM jsonb_to_recordset(tables) AS item(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   obj:=to_regclass(format('education_v30.%I',item.name));
   IF obj IS DISTINCT FROM item.oid::oid OR to_regclass(format('public.%I',item.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
         AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.forced
         AND c.relacl::text IS NOT DISTINCT FROM item.acl)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>item.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>item.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=obj)<>item.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>item.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>item.idx
      OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
          WHERE i.indrelid=obj AND EXISTS(SELECT 1 FROM pg_class d
          WHERE d.relnamespace='public'::regnamespace AND d.relname=ix.relname))
      OR has_table_privilege('authenticated',obj,'SELECT')
      OR has_table_privilege('authenticated',obj,'INSERT')
      OR has_table_privilege('authenticated',obj,'UPDATE')
      OR has_table_privilege('authenticated',obj,'DELETE')
   THEN RAISE EXCEPTION 'Table preflight drift: %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO rows;
   IF rows<>0 THEN RAISE EXCEPTION 'Source table has records: %',item.name; END IF;
 END LOOP;
 FOR v IN SELECT * FROM jsonb_to_recordset(views) AS x(name text,oid integer) LOOP
   obj:=to_regclass(format('education_v30.%I',v.name));
   IF obj IS DISTINCT FROM v.oid::oid THEN RAISE EXCEPTION 'View ID changed: %',v.name; END IF;
 END LOOP;

 SELECT count(DISTINCT p.oid)::int INTO nfunc FROM pg_proc p JOIN jsonb_array_elements(tables) AS matched(value) ON p.prosrc ILIKE '%'||(matched.value->>'name')||'%';
 IF nfunc<>35 THEN RAISE EXCEPTION 'Dependent routine inventory changed: %',nfunc; END IF;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS identity,p.proconfig,
   pg_get_userbyid(p.proowner) AS owner,ns.nspname AS namespace
   FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace JOIN jsonb_array_elements(tables) AS matched(value) ON p.prosrc ILIKE '%'||(matched.value->>'name')||'%'
 LOOP
   IF fn.owner<>'neondb_owner' OR fn.namespace<>'education_v30'
      OR (fn.proconfig IS NOT NULL
        AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
        AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
        AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
        AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public, pg_temp']::text[])
   THEN RAISE EXCEPTION 'Stored routine search_path or owner drift: %',fn.identity; END IF;
 END LOOP;
 FOR fn IN SELECT * FROM jsonb_to_recordset(routines)
    AS x(oid integer,hash text,lang integer,definer boolean,config text,ns_oid integer)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=fn.oid::oid
     AND md5(p.prosrc)=fn.hash AND p.prolang=fn.lang::oid
     AND p.prosecdef=fn.definer AND p.proconfig::text IS NOT DISTINCT FROM fn.config
     AND p.pronamespace=fn.ns_oid::oid AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Qualified routine body changed: %',fn.oid; END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(tables) AS item(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',item.name);
 END LOOP;
 FOR fn IN SELECT * FROM jsonb_to_recordset(routines)
   AS x(oid integer,hash text,lang integer,definer boolean,config text,ns_oid integer)
 LOOP
   olddef:=pg_get_functiondef(fn.oid::oid);
   newdef:=olddef;
   FOR item IN SELECT * FROM jsonb_to_recordset(tables) AS item(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
     newdef:=replace(newdef,format('education_v30.%I',item.name),format('public.%I',item.name));
   END LOOP;
   IF olddef=newdef THEN RAISE EXCEPTION 'No qualified reference for function %',fn.oid; END IF;
   EXECUTE newdef;
   changed:=changed+1;
 END LOOP;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS identity,p.proconfig
   FROM pg_proc p JOIN jsonb_array_elements(tables) AS matched(value) ON p.prosrc ILIKE '%'||(matched.value->>'name')||'%'
 LOOP
   IF fn.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',fn.identity);
     rebound:=rebound+1;
   ELSIF fn.proconfig=ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public, pg_temp',fn.identity);
     rebound:=rebound+1;
   END IF;
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
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=obj)<>item.outf
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>item.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>item.idx
   THEN RAISE EXCEPTION 'Postflight table mismatch: %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',item.name) INTO rows;
   IF rows<>0 THEN RAISE EXCEPTION 'Unexpected migrated rows %',item.name; END IF;
 END LOOP;
 FOR v IN SELECT * FROM jsonb_to_recordset(views) AS x(name text,oid integer) LOOP
   obj:=to_regclass(format('education_v30.%I',v.name));
   IF obj IS DISTINCT FROM v.oid::oid THEN RAISE EXCEPTION 'View OID changed: %',v.name; END IF;
 END LOOP;
 FOR fn IN SELECT * FROM jsonb_to_recordset(routines)
   AS x(oid integer,hash text,lang integer,definer boolean,config text,ns_oid integer)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=fn.oid::oid AND md5(p.prosrc)<>fn.hash
    AND p.prosecdef=fn.definer AND p.pronamespace=fn.ns_oid::oid
    AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Function OID or source unchanged after replace: %',fn.oid; END IF;
   IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=fn.oid::oid
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(tables) AS needle(value)
        WHERE p.prosrc ILIKE '%education_v30.'||(needle.value->>'name')||'%'))
   THEN RAISE EXCEPTION 'Unmigrated qualifier in routine %',fn.oid; END IF;
 END LOOP;
 RAISE NOTICE 'Migrated eight learner/noncredit/survey tables, preserved six views, rewrote % functions, rebound % search paths',changed,rebound;
END $cutover$;