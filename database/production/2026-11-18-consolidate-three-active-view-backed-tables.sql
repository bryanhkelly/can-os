-- CAN OS main: move three ACTIVE but zero-row view-backed relations to public.
-- Their original relation OIDs, FK targets, policies, indexes and triggers
-- survive. Reporting views retain OID dependencies, no redefinition or bridge.
-- This is a schema consolidation, not a deletion or data copy.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $preflight$
DECLARE x record; o oid; n bigint; a record;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Only CAN OS Neon main is authorized'; END IF;
 FOR x IN SELECT * FROM (VALUES
    ('facilitated_learning_participants',450684,'{neondb_owner=arwdDxtm/neondb_owner}',1,3),
    ('facilitated_learning_playback',450711,'{neondb_owner=arwdDxtm/neondb_owner}',2,6),
    ('program_publication_claims',411593,NULL,1,6)
 ) AS exp(name,relation_oid,acl,triggers,out_fks) LOOP
   o:=to_regclass(format('education_v30.%I',x.name));
   IF o IS DISTINCT FROM x.relation_oid::oid
      OR to_regclass(format('public.%I',x.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Source/destination mismatch: %',x.name; END IF;
   SELECT c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text acl
   INTO a FROM pg_class c WHERE c.oid=o;
   IF a.relkind<>'r' OR NOT a.relrowsecurity OR NOT a.relforcerowsecurity
     OR a.acl IS DISTINCT FROM x.acl
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>1
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>x.triggers
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=o AND contype='f')<>x.out_fks
     OR (SELECT count(*) FROM pg_constraint WHERE confrelid=o AND contype='f')<>0
     OR has_table_privilege('authenticated',o,'SELECT')
     OR has_table_privilege('authenticated',o,'INSERT')
     OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%'||x.name||'%')
     OR EXISTS(SELECT 1 FROM pg_class idx JOIN pg_index i ON i.indexrelid=idx.oid
       JOIN pg_class pub ON pub.relnamespace='public'::regnamespace
       AND pub.relname=idx.relname WHERE i.indrelid=o)
   THEN RAISE EXCEPTION 'Unexpected permissions, functions, indexes or FKs: %',x.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',x.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Nonempty source %: % rows',x.name,n; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.facilitated_learning_participants SET SCHEMA public;
ALTER TABLE education_v30.facilitated_learning_playback SET SCHEMA public;
ALTER TABLE education_v30.program_publication_claims SET SCHEMA public;
DO $verify$
DECLARE x record; o oid; n bigint; a record;
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('facilitated_learning_participants',450684,'{neondb_owner=arwdDxtm/neondb_owner}',1,3),
    ('facilitated_learning_playback',450711,'{neondb_owner=arwdDxtm/neondb_owner}',2,6),
    ('program_publication_claims',411593,NULL,1,6)
 ) AS exp(name,relation_oid,acl,triggers,out_fks) LOOP
   o:=to_regclass(format('public.%I',x.name));
   IF o IS DISTINCT FROM x.relation_oid::oid
     OR to_regclass(format('education_v30.%I',x.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Original relation not moved cleanly: %',x.name; END IF;
   SELECT c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text acl
   INTO a FROM pg_class c WHERE c.oid=o;
   IF a.relkind<>'r' OR NOT a.relrowsecurity OR NOT a.relforcerowsecurity
     OR a.acl IS DISTINCT FROM x.acl
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>1
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>x.triggers
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=o AND contype='f')<>x.out_fks
     OR has_table_privilege('authenticated',o,'SELECT')
     OR has_table_privilege('authenticated',o,'INSERT')
   THEN RAISE EXCEPTION 'Post-move security or constraints changed: %',x.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',x.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Post-move record count changed: %',x.name; END IF;
 END LOOP;
END $verify$;
-- Existing view definitions must remain valid without replacement.
SELECT * FROM education_v30.facilitated_room_pilot_evidence LIMIT 0;
SELECT * FROM education_v30.facilitated_room_pilot_weekly_evidence LIMIT 0;
SELECT * FROM education_v30.facilitated_room_media_command_evidence LIMIT 0;
SELECT * FROM education_v30.v301_current_public_program_claims LIMIT 0;
COMMIT;
