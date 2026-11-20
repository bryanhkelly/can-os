-- CAN OS | Neon production main | 38-table canonical schema cutover, 2026-11-19.
-- Cohesive sets: assessment (11), surveys (6), qualification/catalog (13),
-- credentials (3), network (2), noncredit completion (3).
-- First update Drizzle mappings and one qualified runtime SQL reference.
-- No copying, bridge tables, DROP or CASCADE. Preserve table OIDs, data,
-- foreign keys, RLS/FORCE, grants, policies, indexes, triggers.
-- Database functions keep existing legacy-first search precedence and gain
-- public fallback, with pg_temp last for SECURITY DEFINER routines.
-- Atomic DO statement: any mismatch rolls all changes back.
DO $cutover$
DECLARE
 snapshot jsonb := '[{"name":"assessment_accommodation_decisions","oid":406720,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":3,"inf":1,"idx":4},{"name":"assessment_attempt_items","oid":406812,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":2,"inf":3,"idx":8},{"name":"assessment_form_items","oid":406549,"rls":false,"force_rls":false,"pol":0,"trg":1,"outf":2,"inf":1,"idx":6},{"name":"assessment_form_sections","oid":406517,"rls":false,"force_rls":false,"pol":0,"trg":1,"outf":1,"inf":1,"idx":4},{"name":"assessment_form_versions","oid":406479,"rls":false,"force_rls":false,"pol":0,"trg":2,"outf":2,"inf":3,"idx":5},{"name":"assessment_item_options","oid":406126,"rls":false,"force_rls":false,"pol":0,"trg":1,"outf":2,"inf":1,"idx":6},{"name":"assessment_item_scoring_decisions","oid":406964,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":6,"inf":2,"idx":9},{"name":"assessment_item_secure_keys","oid":406157,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":1,"inf":0,"idx":1},{"name":"assessment_item_versions","oid":406090,"rls":false,"force_rls":false,"pol":0,"trg":2,"outf":1,"inf":6,"idx":3},{"name":"assessment_response_choices","oid":406875,"rls":false,"force_rls":false,"pol":0,"trg":2,"outf":3,"inf":0,"idx":5},{"name":"assessment_response_versions","oid":406845,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":1,"inf":3,"idx":5},{"name":"geographic_areas","oid":402265,"rls":true,"force_rls":true,"pol":2,"trg":0,"outf":1,"inf":12,"idx":3},{"name":"learning_award_definition_versions","oid":426009,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":3,"inf":1,"idx":2},{"name":"learning_award_definitions","oid":425984,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":1,"inf":1,"idx":2},{"name":"learning_award_issuance_events","oid":426135,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":3,"inf":0,"idx":2},{"name":"network_reporting_memberships","oid":542254,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":5,"inf":2,"idx":3},{"name":"network_units","oid":542210,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":3,"inf":3,"idx":4},{"name":"noncredit_completion_certificates","oid":414966,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":4,"inf":1,"idx":6},{"name":"noncredit_completion_policies","oid":414881,"rls":false,"force_rls":false,"pol":0,"trg":1,"outf":2,"inf":2,"idx":4},{"name":"noncredit_participation_events","oid":414841,"rls":true,"force_rls":true,"pol":1,"trg":3,"outf":4,"inf":1,"idx":5},{"name":"qualification_program_availability_rules","oid":418290,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":4,"inf":0,"idx":2},{"name":"qualification_program_fit_assessments","oid":418340,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":7,"inf":4,"idx":4},{"name":"qualification_program_fit_policies","oid":418136,"rls":true,"force_rls":true,"pol":2,"trg":0,"outf":1,"inf":2,"idx":3},{"name":"qualification_program_fit_policy_requirements","oid":418246,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":3,"inf":2,"idx":4},{"name":"qualification_program_fit_policy_version_withdrawals","oid":418218,"rls":true,"force_rls":true,"pol":2,"trg":2,"outf":3,"inf":0,"idx":1},{"name":"qualification_program_fit_policy_versions","oid":418162,"rls":true,"force_rls":true,"pol":2,"trg":1,"outf":5,"inf":6,"idx":5},{"name":"qualification_program_fit_requirement_results","oid":418404,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":7,"inf":1,"idx":6},{"name":"qualification_program_fit_reviewer_authorizations","oid":418615,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":5,"inf":2,"idx":1},{"name":"qualification_program_fit_reviewer_revocations","oid":418658,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":3,"inf":0,"idx":1},{"name":"qualification_program_fit_reviews","oid":418690,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":5,"inf":1,"idx":5},{"name":"qualification_subjects","oid":416922,"rls":true,"force_rls":true,"pol":2,"trg":1,"outf":9,"inf":3,"idx":12},{"name":"site_organization_roles","oid":402520,"rls":true,"force_rls":true,"pol":3,"trg":0,"outf":3,"inf":0,"idx":4},{"name":"survey_answer_choices","oid":412340,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":2,"inf":0,"idx":3},{"name":"survey_answers","oid":412308,"rls":true,"force_rls":true,"pol":1,"trg":3,"outf":2,"inf":2,"idx":5},{"name":"survey_question_branch_rules","oid":412039,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":4,"inf":0,"idx":5},{"name":"survey_question_options","oid":412014,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":1,"inf":4,"idx":4},{"name":"survey_version_reviews","oid":412076,"rls":true,"force_rls":true,"pol":1,"trg":1,"outf":3,"inf":0,"idx":5},{"name":"survey_versions","oid":411949,"rls":true,"force_rls":true,"pol":1,"trg":2,"outf":2,"inf":6,"idx":4}]'::jsonb;
 item record;
 func record;
 source_oid oid;
 actual_rows bigint;
 routine_count integer;
 rebound_count integer := 0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'This migration is main-only for CAN OS'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Cannot append untrusted public to definer search paths'; END IF;
 IF jsonb_array_length(snapshot)<>38 THEN RAISE EXCEPTION 'Expected 38 pinned tables'; END IF;

 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS item(name text,oid integer,rls boolean,force_rls boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   source_oid:=to_regclass(format('education_v30.%I',item.name));
   IF source_oid IS DISTINCT FROM item.oid::oid
      OR to_regclass(format('public.%I',item.name)) IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=source_oid
        AND c.relkind='r' AND c.relacl IS NULL
        AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.force_rls)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=source_oid)<>item.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=source_oid AND NOT tgisinternal)<>item.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=source_oid)<>item.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=source_oid)<>item.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=source_oid)<>item.idx
      OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||item.name||'%')
      OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%education_v30.'||item.name||'%')
      OR EXISTS(SELECT 1 FROM pg_index ix JOIN pg_class idx ON idx.oid=ix.indexrelid
         WHERE ix.indrelid=source_oid AND EXISTS(SELECT 1 FROM pg_class pub
           WHERE pub.relnamespace='public'::regnamespace AND pub.relname=idx.relname))
      OR has_table_privilege('authenticated',source_oid,'SELECT')
      OR has_table_privilege('authenticated',source_oid,'INSERT')
      OR has_table_privilege('authenticated',source_oid,'UPDATE')
      OR has_table_privilege('authenticated',source_oid,'DELETE')
   THEN RAISE EXCEPTION 'Cutover table preflight mismatch: %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO actual_rows;
   IF actual_rows<>0
   THEN RAISE EXCEPTION 'Source is unexpectedly populated: % rows in %',actual_rows,item.name; END IF;
 END LOOP;

 SELECT count(DISTINCT routine.oid)::int INTO routine_count
 FROM pg_proc routine JOIN jsonb_array_elements(snapshot) AS dependency(value) ON routine.prosrc ILIKE '%'||(dependency.value->>'name')||'%';
 IF routine_count<>62 THEN
   RAISE EXCEPTION 'Dependent routines changed: expected 62, actual %',routine_count;
 END IF;
 FOR func IN
   SELECT DISTINCT routine.oid,routine.oid::regprocedure AS identity,routine.proconfig,
     routine.prosecdef,pg_get_userbyid(routine.proowner) AS owner,ns.nspname AS schema_name
   FROM pg_proc routine JOIN pg_namespace ns ON ns.oid=routine.pronamespace
   JOIN jsonb_array_elements(snapshot) AS dependency(value) ON routine.prosrc ILIKE '%'||(dependency.value->>'name')||'%'
 LOOP
   IF func.owner<>'neondb_owner' OR func.schema_name<>'education_v30'
      OR (func.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
       AND func.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
       AND func.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
       AND func.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[]
       AND func.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, education_v30, public, pg_temp']::text[])
      OR (func.proconfig IN (ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[],
                             ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[])
          AND NOT func.prosecdef)
   THEN RAISE EXCEPTION 'Routine owner or secure search_path drift: %',func.identity; END IF;
 END LOOP;

 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS item(name text,oid integer,rls boolean,force_rls boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',item.name);
 END LOOP;
 FOR func IN
   SELECT DISTINCT routine.oid,routine.oid::regprocedure AS identity,routine.proconfig
   FROM pg_proc routine JOIN jsonb_array_elements(snapshot) AS dependency(value) ON routine.prosrc ILIKE '%'||(dependency.value->>'name')||'%'
 LOOP
   IF func.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',func.identity);
        rebound_count:=rebound_count+1;
   ELSIF func.proconfig=ARRAY['search_path=education_v30, pg_catalog, pg_temp']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public, pg_temp',func.identity);
        rebound_count:=rebound_count+1;
   ELSIF func.proconfig=ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[]
   THEN EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog, education_v30, public, pg_temp',func.identity);
        rebound_count:=rebound_count+1;
   END IF;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_to_recordset(snapshot) AS item(name text,oid integer,rls boolean,force_rls boolean,pol integer,trg integer,outf integer,inf integer,idx integer) LOOP
   source_oid:=to_regclass(format('public.%I',item.name));
   IF source_oid IS DISTINCT FROM item.oid::oid
      OR to_regclass(format('education_v30.%I',item.name)) IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=source_oid
         AND c.relkind='r' AND c.relacl IS NULL
         AND c.relrowsecurity=item.rls AND c.relforcerowsecurity=item.force_rls)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=source_oid)<>item.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=source_oid AND NOT tgisinternal)<>item.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=source_oid)<>item.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=source_oid)<>item.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=source_oid)<>item.idx
      OR has_table_privilege('authenticated',source_oid,'SELECT')
      OR has_table_privilege('authenticated',source_oid,'INSERT')
      OR has_table_privilege('authenticated',source_oid,'UPDATE')
      OR has_table_privilege('authenticated',source_oid,'DELETE')
   THEN RAISE EXCEPTION 'Postflight structural security mismatch: %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',item.name) INTO actual_rows;
   IF actual_rows<>0 THEN RAISE EXCEPTION 'Unexpected migrated records: %',item.name; END IF;
 END LOOP;
 RAISE NOTICE 'CAN OS main: migrated 38 tables, rebound % routines',rebound_count;
END $cutover$;