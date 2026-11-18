-- CAN OS Neon production main: physically relocate two empty Classroom Connect evidence tables.
-- Keep original table IDs, ten validated outgoing FKs, seven indexes, owner-only forced RLS.
-- No data deletion, cloning, policy broadening or identity bridge.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE name text; oid_target oid; row_count bigint; expected_fks int; expected_indexes int;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database() <> 'neondb'
  THEN RAISE EXCEPTION 'Refusing non-main CAN OS database'; END IF;

  FOREACH name IN ARRAY ARRAY['facilitated_rehearsal_events','facilitated_room_assisted_activity_evidence'] LOOP
    oid_target := to_regclass('education_v30.'||name);
    IF oid_target IS NULL OR to_regclass('public.'||name) IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected source/destination for %',name;
    END IF;
    EXECUTE format('LOCK TABLE education_v30.%I IN ACCESS EXCLUSIVE MODE',name);
    expected_fks := 5;
    expected_indexes := CASE WHEN name='facilitated_rehearsal_events' THEN 3 ELSE 4 END;
    IF NOT EXISTS(SELECT 1 FROM pg_class c
        WHERE c.oid=oid_target AND c.relkind='r' AND c.relowner='neondb_owner'::regrole
        AND c.relrowsecurity AND c.relforcerowsecurity)
      OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=oid_target)<>1
      OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=oid_target
          AND p.polroles<>ARRAY['neondb_owner'::regrole]::oid[])
      OR EXISTS(SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=oid_target AND NOT tr.tgisinternal)
      OR EXISTS(SELECT 1 FROM pg_constraint fk WHERE fk.confrelid=oid_target AND fk.contype='f')
      OR EXISTS(SELECT 1 FROM pg_constraint fk WHERE fk.conrelid=oid_target AND fk.contype='f' AND NOT fk.convalidated)
      OR (SELECT count(*) FROM pg_constraint fk WHERE fk.conrelid=oid_target AND fk.contype='f')<>expected_fks
      OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=oid_target AND d.deptype='n'
           AND d.classid NOT IN('pg_constraint'::regclass,'pg_policy'::regclass))
      OR has_table_privilege('authenticated',oid_target,'SELECT')
      OR has_table_privilege('anonymous',oid_target,'SELECT')
    THEN RAISE EXCEPTION 'Foreign key, security or dependency drift for %',name; END IF;
    EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO row_count;
    IF row_count<>0 THEN RAISE EXCEPTION 'Source % is no longer empty',name; END IF;
    IF (SELECT count(*) FROM pg_index x WHERE x.indrelid=oid_target)<>expected_indexes
      OR EXISTS(SELECT 1 FROM pg_index x JOIN pg_class idx ON idx.oid=x.indexrelid
          WHERE x.indrelid=oid_target AND EXISTS(
            SELECT 1 FROM pg_class y JOIN pg_namespace n ON n.oid=y.relnamespace
            WHERE n.nspname='public' AND y.relname=idx.relname))
    THEN RAISE EXCEPTION 'Index count or name collision for %',name; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','education_v30','education_v30_secure')
        AND p.prokind IN ('f','p')
        AND (pg_get_functiondef(p.oid) ILIKE '%facilitated_rehearsal_events%'
         OR pg_get_functiondef(p.oid) ILIKE '%facilitated_room_assisted_activity_evidence%'))
  THEN RAISE EXCEPTION 'A database routine now depends on the old physical location'; END IF;
END $preflight$;

ALTER TABLE education_v30.facilitated_rehearsal_events SET SCHEMA public;
ALTER TABLE education_v30.facilitated_room_assisted_activity_evidence SET SCHEMA public;
COMMIT;
