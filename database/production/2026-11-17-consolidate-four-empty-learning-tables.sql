-- Move the same four original empty learning tables to public on Neon main.
-- No DROP, CASCADE, copies, new role grants, or change in RLS policies.
-- Preserves object IDs, indexes, FKs, owner and data.
BEGIN;

-- STEP 1
SET LOCAL lock_timeout='5s';

-- STEP 2
SET LOCAL statement_timeout='60s';

-- STEP 3
DO $check$
DECLARE t text; obj oid; n bigint; x bigint;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'Refuse non-main database';
 END IF;
 FOREACH t IN ARRAY ARRAY['guardian_authorities','enrollment_prospect_interests','learner_unit_progress','facilitated_pairing_rate_limits'] LOOP
  obj:=to_regclass('education_v30.'||t);
  IF obj IS NULL OR to_regclass('public.'||t) IS NOT NULL
    THEN RAISE EXCEPTION 'Source missing or destination collision: %',t; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relrowsecurity AND c.relforcerowsecurity)
    THEN RAISE EXCEPTION 'Forced RLS not present: %',t; END IF;
  IF (SELECT count(*) FROM pg_policy p WHERE p.polrelid=obj)<>1
    OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=obj
      AND p.polroles IS DISTINCT FROM ARRAY['neondb_owner'::regrole]::oid[])
    OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.confrelid=obj)
    OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=obj AND NOT f.convalidated)
    OR EXISTS(SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=obj AND NOT tr.tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=obj AND d.deptype='n'
      AND d.classid NOT IN('pg_constraint'::regclass,'pg_policy'::regclass))
    OR has_table_privilege('authenticated',obj,'SELECT')
    OR has_table_privilege('anonymous',obj,'SELECT')
    THEN RAISE EXCEPTION 'Unexpected policy, privilege, FK, trigger or dependency: %',t; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',t) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Table % contains % records',t,n; END IF;
  SELECT count(*) INTO x FROM pg_index ix JOIN pg_class idx ON idx.oid=ix.indexrelid
   WHERE ix.indrelid=obj AND EXISTS(
      SELECT 1 FROM pg_class other JOIN pg_namespace ns ON ns.oid=other.relnamespace
      WHERE ns.nspname='public' AND other.relname=idx.relname);
  IF x<>0 THEN RAISE EXCEPTION 'Public index name conflict for %',t; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN('public','education_v30','education_v30_secure')
      AND p.prokind IN('f','p') AND (pg_get_functiondef(p.oid) ILIKE '%guardian_authorities%' OR pg_get_functiondef(p.oid) ILIKE '%enrollment_prospect_interests%' OR pg_get_functiondef(p.oid) ILIKE '%learner_unit_progress%' OR pg_get_functiondef(p.oid) ILIKE '%facilitated_pairing_rate_limits%'))
    THEN RAISE EXCEPTION 'SQL functions still reference selected relations'; END IF;
END $check$;

-- STEP 4
ALTER TABLE education_v30.guardian_authorities SET SCHEMA public;

-- STEP 5
ALTER TABLE education_v30.enrollment_prospect_interests SET SCHEMA public;

-- STEP 6
ALTER TABLE education_v30.learner_unit_progress SET SCHEMA public;

-- STEP 7
ALTER TABLE education_v30.facilitated_pairing_rate_limits SET SCHEMA public;

COMMIT;
