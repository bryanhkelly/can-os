-- CAN OS Neon production MAIN: move five empty governance and privacy
-- evidence leaves into public, keeping the SAME table OIDs, indexes,
-- outgoing foreign keys, FORCE RLS, one owner-only policy per table, and
-- append-only/privacy triggers. These are not new copies or bridges.
-- All have no incoming FK, dependent view, SQL routine or runtime table mapping.
-- Review before deploying any previously generated v30 migration scripts.
DO $main_move_governance_evidence$
DECLARE
  target record;
  original_oid oid;
  existing_public oid;
  row_count bigint;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'CAN OS Neon main database is required';
  END IF;
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('statement_timeout','90s',true);
  FOR target IN SELECT * FROM (VALUES
    ('assurance_case_events',3,2),
    ('feedback_subjects',10,1),
    ('governance_policy_adoptions',7,1),
    ('governance_policy_scopes',9,1),
    ('learner_data_disclosures',4,1)
  ) AS checked(name,outgoing_fks,triggers) LOOP
    original_oid:=to_regclass('education_v30.'||target.name)::oid;
    existing_public:=to_regclass('public.'||target.name)::oid;
    IF original_oid IS NULL THEN
      IF existing_public IS NULL THEN
        RAISE EXCEPTION 'No native or public table exists for %',target.name;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=existing_public
         AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
        OR (SELECT count(*) FROM pg_policy WHERE polrelid=existing_public)<>1
        OR (SELECT count(*) FROM pg_constraint WHERE conrelid=existing_public AND contype='f')<>target.outgoing_fks
        OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=existing_public AND NOT tgisinternal)<>target.triggers
      THEN RAISE EXCEPTION 'Already-moved table % has a changed policy/constraint graph',target.name; END IF;
      RAISE NOTICE 'Already moved %. Safe idempotent continuation',target.name;
      CONTINUE;
    END IF;
    IF existing_public IS NOT NULL THEN
      RAISE EXCEPTION 'Public table name collision: %',target.name;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=original_oid
       AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=original_oid)<>1
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=original_oid AND contype='f')<>target.outgoing_fks
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=original_oid AND NOT tgisinternal)<>target.triggers
      OR EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid=original_oid AND contype='f')
      OR EXISTS (SELECT 1 FROM pg_depend dep JOIN pg_rewrite rw ON rw.oid=dep.objid
          WHERE dep.refobjid=original_oid)
    THEN RAISE EXCEPTION 'Unexpected inbound FK, view, RLS or trigger on %',target.name; END IF;
    IF EXISTS(
      SELECT 1 FROM pg_proc proc JOIN pg_namespace n ON n.oid=proc.pronamespace
      WHERE n.nspname IN ('public','education_v30','education_v30_secure')
        AND proc.prokind IN ('f','p')
        AND pg_get_functiondef(proc.oid) ILIKE ('%'||target.name||'%')
    ) THEN RAISE EXCEPTION 'Stored SQL routine still depends on %',target.name; END IF;
    EXECUTE format('SELECT count(*) FROM education_v30.%I',target.name) INTO row_count;
    IF row_count<>0 THEN
      RAISE EXCEPTION 'Nonempty audited governance table %: % rows',target.name,row_count;
    END IF;
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',target.name);
    IF to_regclass('public.'||target.name)::oid IS DISTINCT FROM original_oid
      OR to_regclass('education_v30.'||target.name) IS NOT NULL THEN
      RAISE EXCEPTION 'Move did not preserve original table identity for %',target.name;
    END IF;
    RAISE NOTICE 'Moved % into public with existing FKs and RLS',target.name;
  END LOOP;
END
$main_move_governance_evidence$;
