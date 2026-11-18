-- CAN OS Neon production MAIN: OID-preserving consolidation of five empty
-- protected governance, evidence and qualification leaf tables.
-- No copying, deletes, duplicate objects, bridges, CASCADE or role elevation.
-- Existing 21 outbound FKs, 5 validation/append-only triggers, 5 FORCE RLS
-- owner-only policies, indexes and all table object IDs remain unchanged.
-- All tables were confirmed to have no incoming FK, view, or SQL-routine refs.
-- This migration is intentionally not in automatic Drizzle deploy journal.
DO $move_protected_governance_leaves$
DECLARE
  item record;
  source_oid oid;
  after_oid oid;
  row_count bigint;
  actual_outgoing integer;
  actual_triggers integer;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
     OR current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Refusing to migrate outside CAN OS Neon MAIN';
  END IF;
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('statement_timeout','90s',true);
  FOR item IN SELECT * FROM (VALUES
    ('funding_eligibility_evaluations',4,1),
    ('network_governance_delegations',5,1),
    ('qualification_readiness_review_links',3,1),
    ('quality_reassessments',4,1),
    ('site_requirement_evaluations',5,1)
  ) AS expected(name, outgoing_fks, triggers) LOOP
    source_oid:=to_regclass('education_v30.'||item.name)::oid;
    after_oid:=to_regclass('public.'||item.name)::oid;
    IF source_oid IS NULL THEN
      IF after_oid IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=after_oid
            AND c.relrowsecurity AND c.relforcerowsecurity)
           OR (SELECT count(*) FROM pg_policy WHERE polrelid=after_oid)<>1
           OR (SELECT count(*) FROM pg_constraint
               WHERE conrelid=after_oid AND contype='f')<>item.outgoing_fks
           OR (SELECT count(*) FROM pg_trigger
               WHERE tgrelid=after_oid AND NOT tgisinternal)<>item.triggers
        THEN RAISE EXCEPTION 'Previous % move has unexpected security or constraints',item.name; END IF;
        RAISE NOTICE 'Table % already in public',item.name;
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'Missing both legacy and public table %',item.name;
    END IF;
    IF after_oid IS NOT NULL THEN
      RAISE EXCEPTION 'Refusing name collision with public.%',item.name;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=source_oid
       AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=source_oid)<>1
      OR (SELECT count(*) FROM pg_constraint
           WHERE conrelid=source_oid AND contype='f')<>item.outgoing_fks
      OR (SELECT count(*) FROM pg_trigger
           WHERE tgrelid=source_oid AND NOT tgisinternal)<>item.triggers
      OR EXISTS (SELECT 1 FROM pg_constraint
           WHERE confrelid=source_oid AND contype='f')
      OR EXISTS (SELECT 1 FROM pg_depend d
           JOIN pg_rewrite rw ON rw.oid=d.objid
           WHERE d.refobjid=source_oid)
    THEN RAISE EXCEPTION 'Unreviewed dependency, RLS or trigger on %',item.name; END IF;
    IF EXISTS(
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','education_v30','education_v30_secure')
       AND p.prokind IN ('f','p')
       AND pg_get_functiondef(p.oid) ILIKE ('%'||item.name||'%')
    ) THEN RAISE EXCEPTION 'SQL routine still references %',item.name; END IF;
    EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO row_count;
    IF row_count<>0 THEN RAISE EXCEPTION 'Nonempty protected table %: % rows',item.name,row_count; END IF;
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',item.name);
    IF to_regclass('public.'||item.name)::oid IS DISTINCT FROM source_oid
       OR to_regclass('education_v30.'||item.name) IS NOT NULL THEN
       RAISE EXCEPTION 'OID-preserving move incomplete for %',item.name;
    END IF;
    RAISE NOTICE 'Moved % with original OID, FORCE RLS, policies, triggers and FKs',item.name;
  END LOOP;
END
$move_protected_governance_leaves$;
