-- CAN OS main consolidation: three EMPTY but ACTIVE leaf tables.
-- These are application-owned capabilities; do not DROP the tables.
-- This physically relocates the original relations, leaving no old copies.
-- PostgreSQL preserves OIDs, policies, indexes, FKs and triggers.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $preflight$
DECLARE x record; o oid; actual bigint; c record;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909' OR
    current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Only Neon production main is authorized'; END IF;
 FOR x IN SELECT * FROM (VALUES
   ('class_staff_assignments',542062,3,'canonical_class_staff_guard_trg'),
      ('learning_session_events',450603,4,'canonical_learning_evidence_immutable'),
      ('learning_completion_evidence_review_requests',543060,11,'ws3_review_request_mutation_guard')
 ) AS t(name,identity_oid,out_fks,trigger_name) LOOP
   o:=to_regclass(format('education_v30.%I',x.name));
   IF o IS DISTINCT FROM x.identity_oid::oid OR to_regclass(format('public.%I',x.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Source/destination changed: %',x.name; END IF;
   SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO c FROM pg_class WHERE oid=o;
   IF c.relkind<>'r' OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
     OR c.relacl::text IS DISTINCT FROM '{neondb_owner=arwdDxtm/neondb_owner}'
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>1
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>1
     OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=o AND tgname=x.trigger_name AND tgenabled<>'D')
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=o)<>x.out_fks
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=o AND conrelid<>o)<>0
     OR has_table_privilege('authenticated',o,'SELECT')
     OR has_table_privilege('authenticated',o,'INSERT')
     OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%'||x.name||'%')
     OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||x.name||'%')
     OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
          JOIN pg_class pub ON pub.relnamespace='public'::regnamespace
             AND pub.relname=idx.relname WHERE i.indrelid=o)
   THEN RAISE EXCEPTION 'Source security, routine, index or FK state changed: %',x.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',x.name) INTO actual;
   IF actual<>0 THEN RAISE EXCEPTION 'Source now has records (%): %',actual,x.name; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.class_staff_assignments SET SCHEMA public;
ALTER TABLE education_v30.learning_session_events SET SCHEMA public;
ALTER TABLE education_v30.learning_completion_evidence_review_requests SET SCHEMA public;
DO $postflight$
DECLARE x record; o oid; actual bigint; c record;
BEGIN
 FOR x IN SELECT * FROM (VALUES
   ('class_staff_assignments',542062,3,'canonical_class_staff_guard_trg'),
      ('learning_session_events',450603,4,'canonical_learning_evidence_immutable'),
      ('learning_completion_evidence_review_requests',543060,11,'ws3_review_request_mutation_guard')
 ) AS t(name,identity_oid,out_fks,trigger_name) LOOP
   o:=to_regclass(format('public.%I',x.name));
   IF o IS DISTINCT FROM x.identity_oid::oid
      OR to_regclass(format('education_v30.%I',x.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Original relation did not move cleanly: %',x.name; END IF;
   SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO c FROM pg_class WHERE oid=o;
   IF c.relkind<>'r' OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
     OR c.relacl::text IS DISTINCT FROM '{neondb_owner=arwdDxtm/neondb_owner}'
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>1
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>1
     OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=o AND tgname=x.trigger_name AND tgenabled<>'D')
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=o)<>x.out_fks
     OR has_table_privilege('authenticated',o,'SELECT')
     OR has_table_privilege('authenticated',o,'INSERT')
   THEN RAISE EXCEPTION 'Security, triggers or FK preservation failed: %',x.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',x.name) INTO actual;
   IF actual<>0 THEN RAISE EXCEPTION 'Data count changed unexpectedly: %',x.name; END IF;
 END LOOP;
END $postflight$;
COMMIT;
