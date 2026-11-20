-- CAN OS public-only consolidation: move six existing read-only evidence and
-- publication views by identity. No rows, grants, permissions, or dependent
-- view definitions are copied or recreated. OIDs and security_invoker remain.
-- Preserves routine identities; adds public to one SECDEF function search path.
DO $move_views$
DECLARE
 snapshot jsonb:='[{"name":"facilitated_room_media_command_evidence","oid":491560,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","options":"{security_invoker=true}","owner":"neondb_owner","columns_hash":"151921cc4f34ccb1dfb4a01bfe962214","rules":1},{"name":"facilitated_room_pilot_evidence","oid":483529,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","options":"{security_invoker=true}","owner":"neondb_owner","columns_hash":"3b9cd857dfc0efca4c9e1425827c9169","rules":1},{"name":"facilitated_room_pilot_weekly_evidence","oid":483534,"acl":"{neondb_owner=arwdDxtm/neondb_owner}","options":"{security_invoker=true}","owner":"neondb_owner","columns_hash":"71abb643795f1791119fcf8003d84010","rules":1},{"name":"learner_longitudinal_outcomes","oid":415009,"acl":null,"options":"{security_invoker=true}","owner":"neondb_owner","columns_hash":"52a813097171415897b75f8bf448b79f","rules":1},{"name":"qualification_resource_need_estimates","oid":418607,"acl":null,"options":"{security_invoker=true}","owner":"neondb_owner","columns_hash":"f282f4c20dfd6bb425c34663901c2cde","rules":1},{"name":"v301_current_public_program_claims","oid":411640,"acl":null,"options":"{security_invoker=true}","owner":"neondb_owner","columns_hash":"0822700d1a0377124d7601f197b440da","rules":1}]'::jsonb;
 item record; obj oid; fingerprint text;
 vfunc oid:=411645::oid;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'CAN OS Neon main only'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Unsafe public schema CREATE privileges'; END IF;
 IF jsonb_array_length(snapshot)<>6 THEN RAISE EXCEPTION 'View inventory changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=vfunc
    AND md5(p.prosrc)='47ade7cba2196945dcb2459ee7bd955e'
    AND p.prosecdef AND pg_get_userbyid(p.proowner)='neondb_owner'
    AND p.proconfig=ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[])
 THEN RAISE EXCEPTION 'Site claim routine changed since approved snapshot'; END IF;

 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS v(name text,oid integer,acl text,options text,owner text,columns_hash text,rules integer) LOOP
   obj:=to_regclass(format('education_v30.%I',item.name));
   SELECT md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnum::text,',' ORDER BY a.attnum))
    INTO fingerprint FROM pg_attribute a WHERE a.attrelid=obj AND a.attnum>0 AND NOT a.attisdropped;
   IF obj IS DISTINCT FROM item.oid::oid OR to_regclass(format('public.%I',item.name)) IS NOT NULL
     OR fingerprint IS DISTINCT FROM item.columns_hash
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='v'
         AND c.relacl::text IS NOT DISTINCT FROM item.acl
         AND c.reloptions::text IS NOT DISTINCT FROM item.options
         AND pg_get_userbyid(c.relowner)=item.owner)
     OR (SELECT count(*) FROM pg_rewrite w WHERE w.ev_class=obj)<>item.rules
     OR has_table_privilege('authenticated',obj,'SELECT')
   THEN RAISE EXCEPTION 'Protected evidence view changed: %',item.name; END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS v(name text,oid integer,acl text,options text,owner text,columns_hash text,rules integer) LOOP
   EXECUTE format('ALTER VIEW education_v30.%I SET SCHEMA public',item.name);
 END LOOP;
 EXECUTE 'ALTER FUNCTION education_v30.v301_public_site_claims(text)
   SET search_path TO pg_catalog, education_v30, public, pg_temp';

 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS v(name text,oid integer,acl text,options text,owner text,columns_hash text,rules integer) LOOP
   obj:=to_regclass(format('public.%I',item.name));
   SELECT md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnum::text,',' ORDER BY a.attnum))
     INTO fingerprint FROM pg_attribute a WHERE a.attrelid=obj AND a.attnum>0 AND NOT a.attisdropped;
   IF obj IS DISTINCT FROM item.oid::oid
     OR to_regclass(format('education_v30.%I',item.name)) IS NOT NULL
     OR fingerprint IS DISTINCT FROM item.columns_hash
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='v'
         AND c.relacl::text IS NOT DISTINCT FROM item.acl
         AND c.reloptions::text IS NOT DISTINCT FROM item.options
         AND pg_get_userbyid(c.relowner)=item.owner)
     OR (SELECT count(*) FROM pg_rewrite w WHERE w.ev_class=obj)<>item.rules
     OR has_table_privilege('authenticated',obj,'SELECT')
   THEN RAISE EXCEPTION 'View relocation postflight mismatch: %',item.name; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=vfunc
    AND md5(p.prosrc)='47ade7cba2196945dcb2459ee7bd955e'
    AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, education_v30, public, pg_temp']::text[])
 THEN RAISE EXCEPTION 'Site claim routine search path not rebound'; END IF;
 RAISE NOTICE 'Six security-invoker views moved to public with original OIDs and grants';
END $move_views$;