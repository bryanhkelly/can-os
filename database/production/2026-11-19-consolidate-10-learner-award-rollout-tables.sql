-- CAN OS | 2026-11-19 | 10-table main consolidation
-- Learner progress/decisions, awards/completion evidence, rollout attribution
-- and survey invitations. Empty source tables. Single atomic DO transaction.
-- Preserve table and routine OIDs, FORCE RLS, explicit ACLs, FK, index and
-- trigger identities. No copy, compatibility view, bridge, DROP, or CASCADE.
DO $migrate$
DECLARE
 snapshot jsonb:='[{"name":"learner_achievement_decisions","oid":426050,"rls":true,"forced":true,"acl":null,"pol":1,"trg":2,"outf":5,"inf":1,"idx":3},{"name":"learner_lesson_progress","oid":405518,"rls":true,"forced":true,"acl":null,"pol":2,"trg":1,"outf":2,"inf":0,"idx":4},{"name":"learning_award_issuances","oid":426091,"rls":true,"forced":true,"acl":null,"pol":1,"trg":2,"outf":4,"inf":4,"idx":5},{"name":"learning_completion_evidence_bindings","oid":542879,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":11,"inf":0,"idx":4},{"name":"operator_rollout_applications","oid":543289,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":6,"inf":2,"idx":4},{"name":"operator_rollout_decisions","oid":543349,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":2,"outf":2,"inf":0,"idx":2},{"name":"participation_attributions","oid":542389,"rls":true,"forced":true,"acl":null,"pol":1,"trg":2,"outf":7,"inf":0,"idx":6},{"name":"publisher_rollout_decisions","oid":543259,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":2,"outf":2,"inf":0,"idx":2},{"name":"publisher_rollout_plans","oid":543214,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":3,"inf":2,"idx":5},{"name":"survey_invitations","oid":412179,"rls":true,"forced":true,"acl":null,"pol":1,"trg":0,"outf":2,"inf":2,"idx":4}]'::jsonb;
 explicit_functions jsonb:='[{"oid":542183,"hash":"ae571232cd5bc26641c8e12fd0a2e1cb","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":542963,"hash":"ab304543df0512a088a967d8b712d1ab","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543168,"hash":"4cb71b3b141874790469df44ce5f0332","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543171,"hash":"e14dc5730f7c115e3f2c73dd5367d202","lang":14,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543420,"hash":"dfe8b22c0a114ab82b89f6e3658365e1","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543423,"hash":"e236da2af8f1da0f2fcc510b1e954223","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543425,"hash":"a53c4f9bea7786272f28792b8e155131","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"}]'::jsonb;
 t record; f record; rel oid; n bigint; pre text; post text;
 dep_count integer; replaced integer:=0; rebound integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Requires CAN OS production Neon main'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public is writable by authenticated'; END IF;
 IF jsonb_array_length(snapshot)<>10 OR jsonb_array_length(explicit_functions)<>7
 THEN RAISE EXCEPTION 'Pinned snapshot size drift'; END IF;

 FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   rel:=to_regclass(format('education_v30.%I',t.name));
   IF rel IS DISTINCT FROM t.oid::oid
      OR to_regclass(format('public.%I',t.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
        AND c.relrowsecurity=t.rls AND c.relforcerowsecurity=t.forced
        AND c.relacl::text IS NOT DISTINCT FROM t.acl)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>t.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>t.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=rel)<>t.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=rel)<>t.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>t.idx
      OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||t.name||'%')
      OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
        WHERE i.indrelid=rel AND EXISTS(SELECT 1 FROM pg_class pub WHERE pub.relnamespace='public'::regnamespace
          AND pub.relname=idx.relname))
      OR has_table_privilege('authenticated',rel,'SELECT')
      OR has_table_privilege('authenticated',rel,'INSERT')
      OR has_table_privilege('authenticated',rel,'UPDATE')
      OR has_table_privilege('authenticated',rel,'DELETE')
   THEN RAISE EXCEPTION 'Table preflight drift: %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',t.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Source not empty: %',t.name; END IF;
 END LOOP;

 SELECT count(DISTINCT p.oid)::int INTO dep_count FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS d(value) ON p.prosrc ILIKE '%'||(d.value->>'name')||'%';
 IF dep_count<>19 THEN RAISE EXCEPTION 'Function dependency drift: %',dep_count; END IF;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident,p.proconfig,
   pg_get_userbyid(p.proowner) owner,ns.nspname ns
   FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace JOIN jsonb_array_elements(snapshot) AS d(value) ON p.prosrc ILIKE '%'||(d.value->>'name')||'%'
 LOOP
   IF f.owner<>'neondb_owner' OR f.ns<>'education_v30'
      OR (f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
       AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
       AND f.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public, pg_temp']::text[])
   THEN RAISE EXCEPTION 'Unexpected stored routine: %',f.ident; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(explicit_functions)
    AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
      AND md5(p.prosrc)=f.hash AND p.prolang=f.lang::oid
      AND p.prosecdef=f.definer AND p.proconfig::text=f.config
      AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Qualified routine preflight changed: %',f.oid; END IF;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',t.name);
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(explicit_functions)
     AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   pre:=pg_get_functiondef(f.oid::oid);
   post:=pre;
   FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
     post:=replace(post,format('education_v30.%I',t.name),format('public.%I',t.name));
   END LOOP;
   IF pre=post THEN RAISE EXCEPTION 'Expected routine qualifiers: %',f.oid; END IF;
   EXECUTE post;
   replaced:=replaced+1;
 END LOOP;
 FOR f IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident
   FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS d(value) ON p.prosrc ILIKE '%'||(d.value->>'name')||'%'
   WHERE p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
 LOOP
   EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',f.ident);
   rebound:=rebound+1;
 END LOOP;

 FOR t IN SELECT * FROM jsonb_to_recordset(snapshot) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   rel:=to_regclass(format('public.%I',t.name));
   IF rel IS DISTINCT FROM t.oid::oid
     OR to_regclass(format('education_v30.%I',t.name)) IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
       AND c.relrowsecurity=t.rls AND c.relforcerowsecurity=t.forced
       AND c.relacl::text IS NOT DISTINCT FROM t.acl)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>t.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>t.trg
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=rel)<>t.outf
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=rel)<>t.inf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>t.idx
   THEN RAISE EXCEPTION 'Table postflight drift: %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',t.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Unexpected migrated rows %',t.name; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(explicit_functions)
   AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
      AND md5(p.prosrc)<>f.hash AND p.prosecdef=f.definer
      AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Routine identity/replacement mismatch: %',f.oid; END IF;
   IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) AS needle(v)
       WHERE p.prosrc ILIKE '%education_v30.'||(needle.v->>'name')||'%'))
   THEN RAISE EXCEPTION 'Unretired function reference: %',f.oid; END IF;
 END LOOP;
 RAISE NOTICE 'Migrated 10 tables, rewrote % routines, rebound % paths',replaced,rebound;
END $migrate$;