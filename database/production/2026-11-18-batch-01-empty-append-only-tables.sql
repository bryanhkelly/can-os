-- CAN OS schema consolidation, batch 01: three lowest-complexity tables.
-- Zero rows, no application SQL/name references, no public name conflicts.
-- SET SCHEMA preserves OIDs, FKs, indexes, grants and append-only triggers.
-- No data copy, bridge tables, rekeying, CASCADE or DROP.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
DECLARE rec record; o oid; row_count bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'CAN OS Neon main only'; END IF;
 FOR rec IN SELECT * FROM (VALUES
    ('instructor_supplement_withdrawals',404572,2,'supplement_withdrawals_append_only'),
    ('approved_supplement_assessment_sources',407550,4,'approved_supplement_academic_sources_append_only'),
    ('versioned_standard_withdrawals',416315,6,'standard_withdrawals_append_only')
 ) as expected(name,expected_oid,out_fks,trigger_name) LOOP
   o:=to_regclass(format('education_v30.%I',rec.name));
   IF o IS DISTINCT FROM rec.expected_oid::oid
      OR to_regclass(format('public.%I',rec.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Source or public destination changed: %',rec.name; END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=o AND relkind='r'
      AND NOT relrowsecurity AND NOT relforcerowsecurity AND relacl IS NULL)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>0
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=o AND contype='f')<>rec.out_fks
      OR (SELECT count(*) FROM pg_constraint WHERE confrelid=o AND contype='f')<>0
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>1
      OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=o
          AND tgname=rec.trigger_name AND tgenabled<>'D')
      OR EXISTS(SELECT 1 FROM pg_proc WHERE prosrc ILIKE '%'||rec.name||'%')
      OR EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%'||rec.name||'%')
      OR has_table_privilege('authenticated',o,'SELECT')
      OR has_table_privilege('authenticated',o,'INSERT')
      OR has_table_privilege('authenticated',o,'UPDATE')
      OR has_table_privilege('authenticated',o,'DELETE')
   THEN RAISE EXCEPTION 'Unexpected source permissions/dependencies: %',rec.name; END IF;
   IF EXISTS(
      SELECT 1 FROM pg_class idx JOIN pg_index i ON i.indexrelid=idx.oid
      WHERE i.indrelid=o AND EXISTS (
       SELECT 1 FROM pg_class p WHERE p.relnamespace='public'::regnamespace
         AND p.relname=idx.relname)
   ) THEN RAISE EXCEPTION 'Public index-name collision: %',rec.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',rec.name) INTO row_count;
   IF row_count<>0 THEN RAISE EXCEPTION 'Unexpected source data %: %',rec.name,row_count; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.instructor_supplement_withdrawals SET SCHEMA public;
ALTER TABLE education_v30.approved_supplement_assessment_sources SET SCHEMA public;
ALTER TABLE education_v30.versioned_standard_withdrawals SET SCHEMA public;
DO $postflight$
DECLARE rec record; o oid; row_count bigint;
BEGIN
 FOR rec IN SELECT * FROM (VALUES
    ('instructor_supplement_withdrawals',404572,2,'supplement_withdrawals_append_only'),
    ('approved_supplement_assessment_sources',407550,4,'approved_supplement_academic_sources_append_only'),
    ('versioned_standard_withdrawals',416315,6,'standard_withdrawals_append_only')
 ) as expected(name,expected_oid,out_fks,trigger_name) LOOP
   o:=to_regclass(format('public.%I',rec.name));
   IF o IS DISTINCT FROM rec.expected_oid::oid
      OR to_regclass(format('education_v30.%I',rec.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=o AND relkind='r'
        AND NOT relrowsecurity AND NOT relforcerowsecurity AND relacl IS NULL)
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=o AND contype='f')<>rec.out_fks
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>1
      OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=o
          AND tgname=rec.trigger_name AND tgenabled<>'D')
      OR has_table_privilege('authenticated',o,'SELECT')
      OR has_table_privilege('authenticated',o,'INSERT')
      OR has_table_privilege('authenticated',o,'UPDATE')
      OR has_table_privilege('authenticated',o,'DELETE')
   THEN RAISE EXCEPTION 'Post-move OID, FK or access mismatch: %',rec.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',rec.name) INTO row_count;
   IF row_count<>0 THEN RAISE EXCEPTION 'Post-move data mismatch: %',rec.name; END IF;
 END LOOP;
END $postflight$;
COMMIT;
