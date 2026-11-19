-- CAN OS production main, 2026-11-19: single atomic 22-table retirement batch.
-- Empty legacy foundations/funding/qualification tables moved into public by
-- OID-preserving ALTER TABLE SET SCHEMA. No bridge, copy, DROP, or CASCADE.
-- Security, FKs, triggers, policies, indexes and exact row counts are verified.
-- Existing database routines retain legacy-first resolution and gain trusted
-- public fallback. Runtime uses canonical public for these unmapped tables.
DO $cutover$
DECLARE
  snapshot jsonb := '[{"name":"competencies","oid":406195,"rls":false,"force_rls":false,"pol":0,"trg":0,"out_fks":1,"in_fks":2,"indexes":3},{"name":"foundation_module_versions","oid":409843,"rls":false,"force_rls":false,"pol":0,"trg":2,"out_fks":2,"in_fks":9,"indexes":4},{"name":"foundation_version_modules","oid":409876,"rls":false,"force_rls":false,"pol":0,"trg":1,"out_fks":2,"in_fks":0,"indexes":3},{"name":"foundation_versions","oid":409791,"rls":false,"force_rls":false,"pol":0,"trg":2,"out_fks":2,"in_fks":8,"indexes":4},{"name":"funding_allocations","oid":408931,"rls":true,"force_rls":true,"pol":1,"trg":4,"out_fks":4,"in_fks":2,"indexes":8},{"name":"funding_award_budget_versions","oid":415658,"rls":true,"force_rls":true,"pol":1,"trg":1,"out_fks":3,"in_fks":4,"indexes":5},{"name":"funding_awards","oid":408684,"rls":true,"force_rls":true,"pol":1,"trg":0,"out_fks":3,"in_fks":9,"indexes":5},{"name":"qualification_application_survey_submissions","oid":417052,"rls":true,"force_rls":true,"pol":1,"trg":2,"out_fks":5,"in_fks":2,"indexes":9},{"name":"qualification_decisions","oid":417574,"rls":true,"force_rls":true,"pol":1,"trg":3,"out_fks":4,"in_fks":4,"indexes":8},{"name":"qualification_definition_versions","oid":416562,"rls":true,"force_rls":true,"pol":1,"trg":1,"out_fks":2,"in_fks":7,"indexes":4},{"name":"qualification_evaluation_evidence","oid":417482,"rls":true,"force_rls":true,"pol":1,"trg":2,"out_fks":3,"in_fks":0,"indexes":4},{"name":"qualification_evidence_requirements","oid":416782,"rls":true,"force_rls":true,"pol":1,"trg":1,"out_fks":2,"in_fks":2,"indexes":5},{"name":"qualification_evidence_review_decisions","oid":417287,"rls":true,"force_rls":true,"pol":1,"trg":3,"out_fks":4,"in_fks":2,"indexes":6},{"name":"qualification_evidence_submissions","oid":417239,"rls":true,"force_rls":true,"pol":1,"trg":2,"out_fks":5,"in_fks":5,"indexes":9},{"name":"qualification_proposed_sites","oid":416814,"rls":true,"force_rls":true,"pol":1,"trg":1,"out_fks":4,"in_fks":1,"indexes":6},{"name":"qualification_question_mappings","oid":416699,"rls":true,"force_rls":true,"pol":1,"trg":1,"out_fks":3,"in_fks":3,"indexes":6},{"name":"qualification_requirement_evaluations","oid":417421,"rls":true,"force_rls":true,"pol":1,"trg":4,"out_fks":6,"in_fks":8,"indexes":11},{"name":"qualification_requirement_exceptions","oid":417367,"rls":true,"force_rls":true,"pol":1,"trg":2,"out_fks":6,"in_fks":2,"indexes":7},{"name":"qualification_requirements","oid":416632,"rls":true,"force_rls":true,"pol":1,"trg":1,"out_fks":1,"in_fks":11,"indexes":5},{"name":"qualification_reviewer_authorizations","oid":417100,"rls":true,"force_rls":true,"pol":1,"trg":2,"out_fks":6,"in_fks":6,"indexes":8},{"name":"qualification_template_withdrawals","oid":417823,"rls":true,"force_rls":true,"pol":1,"trg":2,"out_fks":4,"in_fks":0,"indexes":5},{"name":"site_space_capability_verifications","oid":411697,"rls":true,"force_rls":true,"pol":1,"trg":2,"out_fks":4,"in_fks":4,"indexes":6}]'::jsonb;
  entry record;
  routine record;
  source_oid oid;
  n bigint;
  routine_count integer;
  changed_routines integer := 0;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('statement_timeout','120s',true);
  IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
  THEN RAISE EXCEPTION 'CAN OS main, owner, neondb required'; END IF;
  IF has_schema_privilege('authenticated','public','CREATE')
  THEN RAISE EXCEPTION 'Public CREATE privilege is not allowed for definer fallback'; END IF;
  IF jsonb_array_length(snapshot)<>22 THEN RAISE EXCEPTION 'Unexpected snapshot length'; END IF;

  FOR entry IN SELECT * FROM jsonb_to_recordset(snapshot) AS d(name text, oid integer, rls boolean, force_rls boolean, pol integer, trg integer, out_fks integer, in_fks integer, indexes integer) LOOP
    source_oid := to_regclass(format('education_v30.%I',entry.name));
    IF source_oid IS DISTINCT FROM entry.oid::oid
      OR to_regclass(format('public.%I',entry.name)) IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=source_oid AND c.relkind='r'
         AND c.relrowsecurity=entry.rls AND c.relforcerowsecurity=entry.force_rls
         AND c.relacl IS NULL)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=source_oid)<>entry.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=source_oid AND NOT tgisinternal)<>entry.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=source_oid)<>entry.out_fks
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=source_oid)<>entry.in_fks
      OR (SELECT count(*) FROM pg_index WHERE indrelid=source_oid)<>entry.indexes
      OR EXISTS (SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||entry.name||'%')
      OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%education_v30.'||entry.name||'%')
      OR EXISTS (SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
        WHERE i.indrelid=source_oid AND EXISTS(SELECT 1 FROM pg_class pub
         WHERE pub.relnamespace='public'::regnamespace AND pub.relname=ix.relname))
      OR has_table_privilege('authenticated',source_oid,'SELECT')
      OR has_table_privilege('authenticated',source_oid,'INSERT')
      OR has_table_privilege('authenticated',source_oid,'UPDATE')
      OR has_table_privilege('authenticated',source_oid,'DELETE')
    THEN RAISE EXCEPTION 'Preflight mismatch: %',entry.name; END IF;
    EXECUTE format('SELECT count(*) FROM education_v30.%I',entry.name) INTO n;
    IF n<>0 THEN RAISE EXCEPTION 'Nonempty source %, row count %',entry.name,n; END IF;
  END LOOP;

  SELECT count(DISTINCT p.oid)::int INTO routine_count
  FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS dep(value)
    ON p.prosrc ILIKE '%'||(dep.value->>'name')||'%';
  IF routine_count<>51 THEN
    RAISE EXCEPTION 'Routine dependency count changed: expected 51 found %',routine_count;
  END IF;
  FOR routine IN
    SELECT DISTINCT p.oid,p.oid::regprocedure AS identity,p.proconfig,
       pg_get_userbyid(p.proowner) AS owner,ns.nspname AS schema_name
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      JOIN jsonb_array_elements(snapshot) AS dep(value)
      ON p.prosrc ILIKE '%'||(dep.value->>'name')||'%'
  LOOP
    IF routine.owner<>'neondb_owner' OR routine.schema_name<>'education_v30'
       OR (routine.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
         AND routine.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[])
    THEN RAISE EXCEPTION 'Routine owner/search_path drifted: %',routine.identity; END IF;
  END LOOP;

  FOR entry IN SELECT * FROM jsonb_to_recordset(snapshot) AS d(name text, oid integer, rls boolean, force_rls boolean, pol integer, trg integer, out_fks integer, in_fks integer, indexes integer) LOOP
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',entry.name);
  END LOOP;
  FOR routine IN
    SELECT DISTINCT p.oid,p.oid::regprocedure AS identity
    FROM pg_proc p JOIN jsonb_array_elements(snapshot) AS dep(value)
      ON p.prosrc ILIKE '%'||(dep.value->>'name')||'%'
    WHERE p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',routine.identity);
    changed_routines := changed_routines+1;
  END LOOP;

  FOR entry IN SELECT * FROM jsonb_to_recordset(snapshot) AS d(name text, oid integer, rls boolean, force_rls boolean, pol integer, trg integer, out_fks integer, in_fks integer, indexes integer) LOOP
    source_oid := to_regclass(format('public.%I',entry.name));
    IF source_oid IS DISTINCT FROM entry.oid::oid
      OR to_regclass(format('education_v30.%I',entry.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=source_oid
        AND c.relkind='r' AND c.relrowsecurity=entry.rls AND c.relforcerowsecurity=entry.force_rls
        AND c.relacl IS NULL)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=source_oid)<>entry.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=source_oid AND NOT tgisinternal)<>entry.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=source_oid)<>entry.out_fks
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=source_oid)<>entry.in_fks
      OR (SELECT count(*) FROM pg_index WHERE indrelid=source_oid)<>entry.indexes
      OR has_table_privilege('authenticated',source_oid,'SELECT')
      OR has_table_privilege('authenticated',source_oid,'INSERT')
    THEN RAISE EXCEPTION 'Postflight mismatch: %',entry.name; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I',entry.name) INTO n;
    IF n<>0 THEN RAISE EXCEPTION 'Moved table unexpectedly populated: %',entry.name; END IF;
  END LOOP;
  RAISE NOTICE 'Moved 22 tables; rebound % dependent functions',changed_routines;
END $cutover$;