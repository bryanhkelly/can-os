-- CAN OS | main-only | Batch 03 of the easy-first consolidation.
-- Eight empty noncolliding tables. No data copy, DROP, CASCADE, or bridge.
-- Uses SET SCHEMA to retain OIDs, FKs (including inbound), indexes,
-- triggers, policies and effective privileges. Existing trigger functions
-- remain in their original schema until a separate routine cutover.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
DECLARE x record; o oid; n bigint; other_schema text:='public';
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Neon main only'; END IF;
 FOR x IN SELECT * FROM (VALUES
    ('academic_course_specification_versions',410275,false,0,3,2,'v26_specification_immutability'),
    ('assurance_case_findings',412682,true,1,1,5,'case_finding_append_only'),
    ('course_curriculum_alignments',410308,false,0,2,6,'course_alignment_append_only'),
    ('course_grading_policy_versions',405746,false,0,1,2,'official_grading_policies_immutable'),
    ('experience_standard_versions',411301,true,1,4,1,'protect_standard_version'),
    ('foundation_refresher_rule_versions',410930,false,0,1,2,'refresher_rule_policy_freeze'),
    ('governance_policy_versions',411114,true,1,7,3,'protect_policy_version'),
    ('qualified_creator_usage',409223,true,1,1,2,'qualified_usage_append_only')
 ) AS expected(name,expected_oid,rls,policy_count,inbound_fks,outbound_fks,trigger_name) LOOP
   o:=to_regclass(format('education_v30.%I',x.name));
   IF o IS DISTINCT FROM x.expected_oid::oid
    OR to_regclass(format('%s.%I',other_schema,x.name)) IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=o AND c.relkind='r'
      AND c.relacl IS NULL AND c.relrowsecurity=x.rls AND c.relforcerowsecurity=x.rls)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>x.policy_count
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>1
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=o
      AND tgname=x.trigger_name AND tgenabled<>'D')
    OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=o)<>x.outbound_fks
    OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=o)<>x.inbound_fks
    OR has_table_privilege('authenticated',o,'SELECT')
    OR has_table_privilege('authenticated',o,'INSERT')
    OR has_table_privilege('authenticated',o,'UPDATE')
    OR has_table_privilege('authenticated',o,'DELETE')
  THEN RAISE EXCEPTION 'Batch 03 identity/dependency/security mismatch: %',x.name; END IF;
   IF EXISTS(
     SELECT 1 FROM pg_index ii JOIN pg_class idx ON idx.oid=ii.indexrelid
     WHERE ii.indrelid=o AND EXISTS (
       SELECT 1 FROM pg_class pub WHERE pub.relnamespace='public'::regnamespace
         AND pub.relname=idx.relname)
   ) OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%'||x.name||'%')
     OR EXISTS (SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||x.name||'%')
   THEN RAISE EXCEPTION 'Batch 03 index, routine or view collision: %',x.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',x.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Batch 03 source no longer empty: % (% rows)',x.name,n; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.academic_course_specification_versions SET SCHEMA public;
ALTER TABLE education_v30.assurance_case_findings SET SCHEMA public;
ALTER TABLE education_v30.course_curriculum_alignments SET SCHEMA public;
ALTER TABLE education_v30.course_grading_policy_versions SET SCHEMA public;
ALTER TABLE education_v30.experience_standard_versions SET SCHEMA public;
ALTER TABLE education_v30.foundation_refresher_rule_versions SET SCHEMA public;
ALTER TABLE education_v30.governance_policy_versions SET SCHEMA public;
ALTER TABLE education_v30.qualified_creator_usage SET SCHEMA public;
DO $postflight$
DECLARE x record; o oid; n bigint; other_schema text:='education_v30';
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('academic_course_specification_versions',410275,false,0,3,2,'v26_specification_immutability'),
    ('assurance_case_findings',412682,true,1,1,5,'case_finding_append_only'),
    ('course_curriculum_alignments',410308,false,0,2,6,'course_alignment_append_only'),
    ('course_grading_policy_versions',405746,false,0,1,2,'official_grading_policies_immutable'),
    ('experience_standard_versions',411301,true,1,4,1,'protect_standard_version'),
    ('foundation_refresher_rule_versions',410930,false,0,1,2,'refresher_rule_policy_freeze'),
    ('governance_policy_versions',411114,true,1,7,3,'protect_policy_version'),
    ('qualified_creator_usage',409223,true,1,1,2,'qualified_usage_append_only')
 ) AS expected(name,expected_oid,rls,policy_count,inbound_fks,outbound_fks,trigger_name) LOOP
   o:=to_regclass(format('public.%I',x.name));
   IF o IS DISTINCT FROM x.expected_oid::oid
    OR to_regclass(format('%s.%I',other_schema,x.name)) IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=o AND c.relkind='r'
      AND c.relacl IS NULL AND c.relrowsecurity=x.rls AND c.relforcerowsecurity=x.rls)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>x.policy_count
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>1
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=o
      AND tgname=x.trigger_name AND tgenabled<>'D')
    OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=o)<>x.outbound_fks
    OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=o)<>x.inbound_fks
    OR has_table_privilege('authenticated',o,'SELECT')
    OR has_table_privilege('authenticated',o,'INSERT')
    OR has_table_privilege('authenticated',o,'UPDATE')
    OR has_table_privilege('authenticated',o,'DELETE')
  THEN RAISE EXCEPTION 'Batch 03 identity/dependency/security mismatch: %',x.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',x.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Batch 03 postflight count mismatch: %',x.name; END IF;
 END LOOP;
END $postflight$;
COMMIT;
