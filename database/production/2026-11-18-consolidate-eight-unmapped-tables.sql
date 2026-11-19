-- CAN OS | Neon production main | OID-preserving 8-table batch.
-- GitHub: main. No test01, copy, bridge, DROP, or CASCADE.
-- Only tables with zero exact rows, no duplicate public table, no direct
-- pg_proc/pg_views definitions, and no live source-code references.
-- One transaction (DO statement): an exception rolls back every ALTER.
DO $migrate$
DECLARE
  x record;
  source_oid oid;
  n bigint;
BEGIN
  IF current_setting('neon.project_id',true) <> 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) <> 'br-restless-sea-ar9ooo55'
  THEN RAISE EXCEPTION 'Refusing to run outside CAN OS Neon main'; END IF;

  -- Pin exact table identities and permissions/FK/trigger counts.
  FOR x IN SELECT * FROM (VALUES
    ('equipment_acquisitions', 415113, true, 1, 1, 2, 4),
    ('equipment_assignments', 415269, true, 1, 1, 1, 5),
    ('feedback_items', 412394, true, 1, 3, 5, 4),
    ('improvement_plans', 413151, true, 1, 1, 2, 5),
    ('learner_foundation_assignments', 410821, true, 1, 1, 3, 8),
    ('participant_technology_assessments', 415046, true, 1, 1, 2, 4),
    ('readiness_evaluations', 410712, true, 1, 2, 3, 5),
    ('survey_anonymous_redemptions', 412211, true, 1, 1, 1, 1)
  ) v(table_name, expected_oid, rls, policies, triggers, inbound_fks, outbound_fks)
  LOOP
    source_oid := to_regclass(format('education_v30.%I',x.table_name));
    IF source_oid IS DISTINCT FROM x.expected_oid::oid
       OR to_regclass(format('public.%I',x.table_name)) IS NOT NULL
       OR NOT EXISTS (
          SELECT 1 FROM pg_class c WHERE c.oid=source_oid AND c.relkind='r'
          AND c.relrowsecurity=x.rls AND c.relforcerowsecurity=x.rls
          AND c.relacl IS NULL
       )
       OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=source_oid) <> x.policies
       OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=source_oid AND NOT t.tgisinternal) <> x.triggers
       OR (SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.confrelid=source_oid) <> x.inbound_fks
       OR (SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.conrelid=source_oid) <> x.outbound_fks
       OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%' || x.table_name || '%')
       OR EXISTS (SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%' || x.table_name || '%')
       OR EXISTS (
         SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
         WHERE i.indrelid=source_oid
         AND EXISTS (SELECT 1 FROM pg_class pub WHERE pub.relnamespace='public'::regnamespace AND pub.relname=idx.relname)
       )
       OR has_table_privilege('authenticated',source_oid,'SELECT')
       OR has_table_privilege('authenticated',source_oid,'INSERT')
       OR has_table_privilege('authenticated',source_oid,'UPDATE')
       OR has_table_privilege('authenticated',source_oid,'DELETE')
    THEN RAISE EXCEPTION 'Preflight identity/security/dependency mismatch: %',x.table_name; END IF;
    EXECUTE format('SELECT count(*) FROM education_v30.%I',x.table_name) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'Nonempty source: %, % rows',x.table_name,n; END IF;
  END LOOP;

  FOR x IN SELECT * FROM (VALUES
    ('equipment_acquisitions', 415113, true, 1, 1, 2, 4),
    ('equipment_assignments', 415269, true, 1, 1, 1, 5),
    ('feedback_items', 412394, true, 1, 3, 5, 4),
    ('improvement_plans', 413151, true, 1, 1, 2, 5),
    ('learner_foundation_assignments', 410821, true, 1, 1, 3, 8),
    ('participant_technology_assessments', 415046, true, 1, 1, 2, 4),
    ('readiness_evaluations', 410712, true, 1, 2, 3, 5),
    ('survey_anonymous_redemptions', 412211, true, 1, 1, 1, 1)
  ) v(table_name, expected_oid, rls, policies, triggers, inbound_fks, outbound_fks)
  LOOP
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',x.table_name);
    source_oid := to_regclass(format('public.%I',x.table_name));
    IF source_oid IS DISTINCT FROM x.expected_oid::oid
       OR to_regclass(format('education_v30.%I',x.table_name)) IS NOT NULL
       OR NOT EXISTS (
          SELECT 1 FROM pg_class c WHERE c.oid=source_oid AND c.relkind='r'
          AND c.relrowsecurity=x.rls AND c.relforcerowsecurity=x.rls
          AND c.relacl IS NULL
       )
       OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=source_oid) <> x.policies
       OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=source_oid AND NOT t.tgisinternal) <> x.triggers
       OR (SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.confrelid=source_oid) <> x.inbound_fks
       OR (SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.conrelid=source_oid) <> x.outbound_fks
       OR has_table_privilege('authenticated',source_oid,'SELECT')
       OR has_table_privilege('authenticated',source_oid,'INSERT')
    THEN RAISE EXCEPTION 'Postflight mismatch: %',x.table_name; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I',x.table_name) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'Unexpected postflight data: %',x.table_name; END IF;
  END LOOP;
END $migrate$;