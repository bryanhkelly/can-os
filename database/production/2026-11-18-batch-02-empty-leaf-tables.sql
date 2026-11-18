-- CAN OS consolidation batch 02: five zero-row noncolliding leaf tables.
-- Original OIDs, triggers, FK targets, RLS policies and ACLs survive.
-- No duplicate tables, data copies, identity maps or CASCADE.
-- Commit relevant Drizzle mappings/acceptance checks on GitHub main as part of cutover.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$
DECLARE v record; o oid; n bigint; a record;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not CAN OS production Neon main'; END IF;
 FOR v IN SELECT * FROM (VALUES
    ('instructional_track_command_receipts',409472,true,1,1,'instructional_track_command_receipts_append_only'),
    ('learning_award_artifacts',426169,true,1,1,'learning_award_artifacts_immutable'),
    ('official_course_requirement_versions',405693,false,0,1,'official_requirements_immutable'),
    ('noncredit_released_seats',524528,true,1,3,'noncredit_released_seat_immutable_guard'),
    ('network_member_identifiers',542308,true,1,4,'network_member_identifier_guard')
 ) AS b(name,expected_oid,rls_enabled,expected_policies,expected_out_fks,required_trigger) LOOP
   o:=to_regclass(format('education_v30.%I',v.name));
   IF o IS DISTINCT FROM v.expected_oid::oid OR to_regclass(format('public.%I',v.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Source or destination changed: %',v.name; END IF;
   SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO a FROM pg_class WHERE oid=o;
   IF a.relkind<>'r'
     OR a.relrowsecurity IS DISTINCT FROM v.rls_enabled
     OR a.relforcerowsecurity IS DISTINCT FROM v.rls_enabled
     OR (a.relacl IS NOT NULL AND a.relacl::text<>'{neondb_owner=arwdDxtm/neondb_owner}')
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>v.expected_policies
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>1
     OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=o AND tgname=v.required_trigger AND tgenabled<>'D')
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=o AND contype='f')<>v.expected_out_fks
     OR (SELECT count(*) FROM pg_constraint WHERE confrelid=o AND contype='f')<>0
     OR EXISTS(SELECT 1 FROM pg_proc WHERE prosrc ILIKE '%'||v.name||'%')
     OR EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%'||v.name||'%')
     OR has_table_privilege('authenticated',o,'SELECT')
     OR has_table_privilege('authenticated',o,'INSERT')
     OR has_table_privilege('authenticated',o,'UPDATE')
     OR has_table_privilege('authenticated',o,'DELETE')
     OR EXISTS(
       SELECT 1 FROM pg_index idx JOIN pg_class ic ON ic.oid=idx.indexrelid
       WHERE idx.indrelid=o AND EXISTS(SELECT 1 FROM pg_class x
         WHERE x.relnamespace='public'::regnamespace AND x.relname=ic.relname)
     )
   THEN RAISE EXCEPTION 'Unexpected dependencies or permission state: %',v.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',v.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Source no longer empty: %, rows %',v.name,n; END IF;
 END LOOP;
END $guard$;
ALTER TABLE education_v30.instructional_track_command_receipts SET SCHEMA public;
ALTER TABLE education_v30.learning_award_artifacts SET SCHEMA public;
ALTER TABLE education_v30.official_course_requirement_versions SET SCHEMA public;
ALTER TABLE education_v30.noncredit_released_seats SET SCHEMA public;
ALTER TABLE education_v30.network_member_identifiers SET SCHEMA public;
DO $verify$
DECLARE v record; o oid; n bigint; a record;
BEGIN
 FOR v IN SELECT * FROM (VALUES
    ('instructional_track_command_receipts',409472,true,1,1,'instructional_track_command_receipts_append_only'),
    ('learning_award_artifacts',426169,true,1,1,'learning_award_artifacts_immutable'),
    ('official_course_requirement_versions',405693,false,0,1,'official_requirements_immutable'),
    ('noncredit_released_seats',524528,true,1,3,'noncredit_released_seat_immutable_guard'),
    ('network_member_identifiers',542308,true,1,4,'network_member_identifier_guard')
 ) AS b(name,expected_oid,rls_enabled,expected_policies,expected_out_fks,required_trigger) LOOP
   o:=to_regclass(format('public.%I',v.name));
   IF o IS DISTINCT FROM v.expected_oid::oid OR to_regclass(format('education_v30.%I',v.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Missing/changed migrated table: %',v.name; END IF;
   SELECT relrowsecurity,relforcerowsecurity,relacl INTO a FROM pg_class WHERE oid=o;
   IF a.relrowsecurity IS DISTINCT FROM v.rls_enabled
     OR a.relforcerowsecurity IS DISTINCT FROM v.rls_enabled
     OR (a.relacl IS NOT NULL AND a.relacl::text<>'{neondb_owner=arwdDxtm/neondb_owner}')
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>v.expected_policies
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>1
     OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=o AND tgname=v.required_trigger AND tgenabled<>'D')
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=o AND contype='f')<>v.expected_out_fks
     OR has_table_privilege('authenticated',o,'SELECT')
     OR has_table_privilege('authenticated',o,'INSERT')
   THEN RAISE EXCEPTION 'Security/constraint preservation failed: %',v.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',v.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Unexpected migrated row count: %',v.name; END IF;
 END LOOP;
END $verify$;
COMMIT;
