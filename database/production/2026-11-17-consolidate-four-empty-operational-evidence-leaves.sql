-- CAN OS Neon MAIN: four zero-row operational evidence leaves relocated
-- to public without copying data, creating bridges or altering security.
-- Each table keeps its PostgreSQL OID, existing append-only/eligibility
-- trigger, foreign keys, indexes, FORCE RLS and owner-only policy.
-- This file is intentionally outside automatic Drizzle migrations.
DO $consolidate_four_operational_leaves$
DECLARE
  item record;
  original_oid oid;
  new_oid oid;
  n bigint;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb'
  THEN RAISE EXCEPTION 'Refusing anything except CAN OS Neon production main'; END IF;
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('statement_timeout','90s',true);
  FOR item IN SELECT * FROM (VALUES
    ('applicant_offer_responses',3,2),
    ('content_usage_events',1,1),
    ('control_evaluation_evidence',2,1),
    ('equipment_custody_events',7,1)
  ) as expected(name,outbound_fks,user_triggers) LOOP
    original_oid:=to_regclass('education_v30.'||item.name)::oid;
    new_oid:=to_regclass('public.'||item.name)::oid;
    IF original_oid IS NULL THEN
      IF new_oid IS NULL THEN RAISE EXCEPTION 'Missing native and public table %',item.name; END IF;
      IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=new_oid
         AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
        OR (SELECT count(*) FROM pg_policy WHERE polrelid=new_oid)<>1
        OR (SELECT count(*) FROM pg_constraint WHERE conrelid=new_oid AND contype='f')<>item.outbound_fks
        OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=new_oid AND NOT tgisinternal)<>item.user_triggers
      THEN RAISE EXCEPTION 'Previously moved % fails security/dependency verification',item.name; END IF;
      RAISE NOTICE '% was already consolidated into public',item.name;
      CONTINUE;
    END IF;
    IF new_oid IS NOT NULL THEN RAISE EXCEPTION 'Public name collision for %',item.name; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=original_oid
       AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=original_oid)<>1
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=original_oid AND contype='f')<>item.outbound_fks
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=original_oid AND NOT tgisinternal)<>item.user_triggers
      OR EXISTS(SELECT 1 FROM pg_constraint WHERE confrelid=original_oid AND contype='f')
      OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid WHERE d.refobjid=original_oid)
      OR EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','education_v30','education_v30_secure')
          AND p.prokind IN ('f','p')
          AND pg_get_functiondef(p.oid) ILIKE ('%'||item.name||'%')
      )
    THEN RAISE EXCEPTION 'Unexpected FK, RLS, trigger, view or SQL routine for %',item.name; END IF;
    EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO n;
    IF n<>0 THEN RAISE EXCEPTION 'Nonempty protected evidence % (% rows)',item.name,n; END IF;
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',item.name);
    IF to_regclass('public.'||item.name)::oid IS DISTINCT FROM original_oid
       OR to_regclass('education_v30.'||item.name) IS NOT NULL
    THEN RAISE EXCEPTION 'Post-move verification failed for %',item.name; END IF;
    RAISE NOTICE 'Relocated % without dropping dependent constraints',item.name;
  END LOOP;
END
$consolidate_four_operational_leaves$;
