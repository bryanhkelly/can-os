-- CAN OS main: two empty non-colliding operational tables.
-- Preserve original table identities (OIDs), index and sequence ownership,
-- FK constraints, existing forced RLS policies, privileges and zero rows.
-- Refuse concurrent writes with ACCESS EXCLUSIVE locks.
-- No table recreation, role grants, identity crosswalks, or CASCADE.
BEGIN;
-- STEP 1
SET LOCAL lock_timeout='5s';

-- STEP 2
SET LOCAL statement_timeout='45s';

-- STEP 3
DO $guard$
DECLARE name text; rel oid; n bigint; fk_count int;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
  OR current_database()<>'neondb' THEN
   RAISE EXCEPTION 'Only CAN OS Neon production main is allowed';
 END IF;
 FOREACH name IN ARRAY ARRAY['published_asset_reviews','noncredit_waitlist_email_deliveries']
 LOOP
  rel:=to_regclass('education_v30.'||name);
  IF rel IS NULL OR to_regclass('public.'||name) IS NOT NULL THEN
    RAISE EXCEPTION 'Source missing or name collision for %',name;
  END IF;
  EXECUTE format('LOCK TABLE education_v30.%I IN ACCESS EXCLUSIVE MODE',name);
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=rel
     AND c.relkind='r' AND c.relowner='neondb_owner'::regrole
     AND c.relrowsecurity AND c.relforcerowsecurity)
  THEN RAISE EXCEPTION 'Source ownership or forced RLS changed for %',name; END IF;
  IF (SELECT count(*) FROM pg_policy p WHERE p.polrelid=rel)<>1
    OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=rel
        AND p.polroles<>ARRAY['neondb_owner'::regrole]::oid[])
    OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=rel AND NOT t.tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_constraint fk WHERE fk.contype='f' AND fk.confrelid=rel)
    OR EXISTS(SELECT 1 FROM pg_constraint fk WHERE fk.contype='f' AND fk.conrelid=rel AND NOT fk.convalidated)
    OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=rel
       AND d.deptype='n' AND d.classid NOT IN ('pg_constraint'::regclass,'pg_policy'::regclass))
    OR has_table_privilege('authenticated',rel,'SELECT')
    OR has_table_privilege('anonymous',rel,'SELECT')
  THEN RAISE EXCEPTION 'Source grants, FKs, triggers, or policies changed for %',name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Source % contains % records',name,n; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_index ix JOIN pg_class idx ON idx.oid=ix.indexrelid
    WHERE ix.indrelid=rel AND EXISTS (
      SELECT 1 FROM pg_class name_conflict JOIN pg_namespace ns ON ns.oid=name_conflict.relnamespace
      WHERE ns.nspname='public' AND name_conflict.relname=idx.relname
    )
  ) THEN RAISE EXCEPTION 'Index name collision for %',name; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_depend d
    JOIN pg_class seq ON seq.oid=d.objid AND seq.relkind='S'
    WHERE d.refobjid=rel AND EXISTS(
      SELECT 1 FROM pg_class existing JOIN pg_namespace ns ON ns.oid=existing.relnamespace
      WHERE ns.nspname='public' AND existing.relname=seq.relname
    )
  ) THEN RAISE EXCEPTION 'Owned sequence collision for %',name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN('public','education_v30','education_v30_secure')
     AND p.prokind IN('f','p')
     AND (pg_get_functiondef(p.oid) ILIKE '%published_asset_reviews%'
      OR pg_get_functiondef(p.oid) ILIKE '%noncredit_waitlist_email_deliveries%'))
 THEN RAISE EXCEPTION 'Unexpected SQL routine dependency'; END IF;
END $guard$;

-- STEP 4
ALTER TABLE education_v30.published_asset_reviews SET SCHEMA public;

-- STEP 5
ALTER TABLE education_v30.noncredit_waitlist_email_deliveries SET SCHEMA public;

COMMIT;
