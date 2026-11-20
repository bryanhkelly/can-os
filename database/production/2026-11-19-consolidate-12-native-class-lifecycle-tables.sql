-- CAN OS Neon main | 12 native Class lifecycle and delivery support tables.
-- Cohesive Course/Class authorization and enrollment closeout.
-- All sources empty. Preserve table OIDs, explicit restricted ACLs, FORCE RLS,
-- foreign keys, policies, triggers and indexes. Preserve routine identities.
-- Rewrite 13 explicit legacy function definitions in same atomic transaction;
-- rebind paths of other dependent routines. No bridges, copies, DROP, CASCADE.
DO $batch$
DECLARE
 snapshot jsonb:='[{"name":"class_completion_policy_versions","oid":542966,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":5,"inf":2,"idx":3},{"name":"class_enrollment_completion_pins","oid":543021,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":4,"inf":0,"idx":2},{"name":"class_enrollments","oid":541942,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":4,"outf":5,"inf":12,"idx":6},{"name":"class_outcomes","oid":541997,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":2,"outf":5,"inf":5,"idx":4},{"name":"class_session_agenda_revisions","oid":543172,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":3,"inf":0,"idx":4},{"name":"class_sessions","oid":542106,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":4,"inf":1,"idx":5},{"name":"class_survey_campaigns","oid":542157,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":3,"inf":0,"idx":2},{"name":"classes","oid":541814,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":7,"inf":12,"idx":4},{"name":"delivery_sessions","oid":405113,"rls":false,"forced":false,"acl":null,"pol":0,"trg":0,"outf":5,"inf":4,"idx":8},{"name":"facilitated_classroom_plans","oid":516096,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":7,"inf":1,"idx":7},{"name":"official_course_assignment_versions","oid":405719,"rls":false,"forced":false,"acl":null,"pol":0,"trg":1,"outf":1,"inf":1,"idx":4},{"name":"operator_rollout_class_links","oid":543379,"rls":true,"forced":true,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","pol":1,"trg":1,"outf":4,"inf":0,"idx":2}]'::jsonb;
 explicit_functions jsonb:='[{"oid":542147,"hash":"88bc92b93d7ad1bfdb8f3f741603e59e","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":542149,"hash":"1d0789731f29357fb13f31f202717df0","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":542183,"hash":"785a9601d3ff4e0e58a6bba887c73d1f","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":542185,"hash":"ebfcd1f2d88034f2b3829beaf691aa00","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":542963,"hash":"f809ac4647e1122803a68c74aa90a44f","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":543052,"hash":"68ea8bdd994be51aa779b5f812ba8c96","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543054,"hash":"19c392af0416f9478d741d7fc15748e4","lang":13627,"definer":true,"config":"{\"search_path=education_v30, pg_catalog, pg_temp\"}"},{"oid":543056,"hash":"64544d85051cf6396a5f05780d67880b","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":543168,"hash":"27ab098532f35951f61da60cab569007","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543171,"hash":"64320907705bd1612ff09b806b1680b2","lang":14,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543211,"hash":"2b658928381dd1364313a1b573a4bcec","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"},{"oid":543420,"hash":"c3844b4fedb9349296a8e5b9e98b8f4d","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog\"}"},{"oid":543423,"hash":"62d3095bcb0738b7f34389f56bb029b9","lang":13627,"definer":false,"config":"{\"search_path=education_v30, pg_catalog, public\"}"}]'::jsonb;
 target record; fn record; source_oid oid; rows bigint;
 original_definition text; corrected_definition text;
 all_routines integer; changed_functions integer:=0; rebound integer:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'CAN OS production main required'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public schema cannot be writable for secure function fallback'; END IF;
 IF jsonb_array_length(snapshot)<>12 OR jsonb_array_length(explicit_functions)<>13
 THEN RAISE EXCEPTION 'Unexpected Class snapshot size'; END IF;

 FOR target IN SELECT * FROM jsonb_to_recordset(snapshot) AS target(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   source_oid:=to_regclass(format('education_v30.%I',target.name));
   IF source_oid IS DISTINCT FROM target.oid::oid
      OR to_regclass(format('public.%I',target.name)) IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=source_oid AND c.relkind='r'
          AND c.relrowsecurity=target.rls AND c.relforcerowsecurity=target.forced
          AND c.relacl::text IS NOT DISTINCT FROM target.acl)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=source_oid)<>target.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=source_oid AND NOT tgisinternal)<>target.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=source_oid)<>target.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=source_oid)<>target.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=source_oid)<>target.idx
      OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||target.name||'%')
      OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
          WHERE i.indrelid=source_oid
          AND EXISTS(SELECT 1 FROM pg_class d WHERE d.relnamespace='public'::regnamespace AND d.relname=ix.relname))
      OR has_table_privilege('authenticated',source_oid,'SELECT')
      OR has_table_privilege('authenticated',source_oid,'INSERT')
      OR has_table_privilege('authenticated',source_oid,'UPDATE')
      OR has_table_privilege('authenticated',source_oid,'DELETE')
   THEN RAISE EXCEPTION 'Table preflight failure: %',target.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',target.name) INTO rows;
   IF rows<>0 THEN RAISE EXCEPTION 'Expected empty native Class table: %',target.name; END IF;
 END LOOP;
 SELECT count(DISTINCT p.oid)::int INTO all_routines FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS target_name(item) ON p.prosrc ILIKE '%'||(target_name.item->>'name')||'%';
 IF all_routines<>16 THEN
   RAISE EXCEPTION 'Dependent routine set changed: expected 16 found %',all_routines; END IF;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident,p.proconfig,p.prosecdef,
         pg_get_userbyid(p.proowner) AS owner,n.nspname AS ns
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN jsonb_array_elements(snapshot) AS target_name(item) ON p.prosrc ILIKE '%'||(target_name.item->>'name')||'%'
 LOOP
   IF fn.owner<>'neondb_owner' OR fn.ns<>'education_v30'
      OR (fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
       AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
       AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[])
   THEN RAISE EXCEPTION 'Stored routine configuration drift: %',fn.ident; END IF;
 END LOOP;
 FOR fn IN SELECT * FROM jsonb_to_recordset(explicit_functions)
          AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=fn.oid::oid
      AND md5(p.prosrc)=fn.hash AND p.prolang=fn.lang::oid
      AND p.prosecdef=fn.definer AND p.proconfig::text=fn.config
      AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Qualified Class function changed: %',fn.oid; END IF;
 END LOOP;

 FOR target IN SELECT * FROM jsonb_to_recordset(snapshot) AS target(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',target.name);
 END LOOP;
 FOR fn IN SELECT * FROM jsonb_to_recordset(explicit_functions)
          AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   original_definition:=pg_get_functiondef(fn.oid::oid);
   corrected_definition:=original_definition;
   FOR target IN SELECT * FROM jsonb_to_recordset(snapshot) AS target(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
     corrected_definition:=replace(corrected_definition,
       format('education_v30.%I',target.name),format('public.%I',target.name));
   END LOOP;
   IF corrected_definition=original_definition
   THEN RAISE EXCEPTION 'Missing explicit Class reference in function %',fn.oid; END IF;
   EXECUTE corrected_definition;
   changed_functions:=changed_functions+1;
 END LOOP;
 FOR fn IN SELECT DISTINCT p.oid,p.oid::regprocedure AS ident,p.proconfig
     FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS target_name(item) ON p.prosrc ILIKE '%'||(target_name.item->>'name')||'%'
 LOOP
   IF fn.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
   THEN
     EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',fn.ident);
     rebound:=rebound+1;
   ELSIF fn.proconfig=ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
   THEN
     EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public, pg_temp',fn.ident);
     rebound:=rebound+1;
   END IF;
 END LOOP;

 FOR target IN SELECT * FROM jsonb_to_recordset(snapshot) AS target(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   source_oid:=to_regclass(format('public.%I',target.name));
   IF source_oid IS DISTINCT FROM target.oid::oid
      OR to_regclass(format('education_v30.%I',target.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=source_oid AND c.relkind='r'
         AND c.relrowsecurity=target.rls AND c.relforcerowsecurity=target.forced
         AND c.relacl::text IS NOT DISTINCT FROM target.acl)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=source_oid)<>target.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=source_oid AND NOT tgisinternal)<>target.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=source_oid)<>target.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=source_oid)<>target.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=source_oid)<>target.idx
   THEN RAISE EXCEPTION 'Class postflight metadata mismatch: %',target.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',target.name) INTO rows;
   IF rows<>0 THEN RAISE EXCEPTION 'Class rows unexpectedly appeared: %',target.name; END IF;
 END LOOP;
 FOR fn IN SELECT * FROM jsonb_to_recordset(explicit_functions)
          AS x(oid integer,hash text,lang integer,definer boolean,config text)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=fn.oid::oid
     AND md5(p.prosrc)<>fn.hash AND p.prosecdef=fn.definer
     AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Class function identity not preserved: %',fn.oid; END IF;
   IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=fn.oid::oid
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) AS needle(item)
       WHERE p.prosrc ILIKE '%education_v30.'||(needle.item->>'name')||'%'))
   THEN RAISE EXCEPTION 'Unretired Class qualifier in function: %',fn.oid; END IF;
 END LOOP;
 RAISE NOTICE 'Migrated 12 native Class tables, rewrote % functions and rebound % function paths',changed_functions,rebound;
END $batch$;