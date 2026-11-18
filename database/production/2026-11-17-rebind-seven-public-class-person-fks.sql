-- CAN OS Neon production MAIN. Seven public Class/facilitator FKs still
-- pointed to the empty education_v30.persons instead of public.people.
-- Rebind exact validated columns, preserving original constraint names,
-- referential actions, RLS policies and independent Class approval model.
-- Excludes the three legacy Person-correspondence tables on purpose.
-- No data copying, Person merges, grant creation or CASCADE.
DO $public_class_person_fk_cutover$
DECLARE
  expected record;
  source_rel oid;
  fk record;
  expected_def text;
  rows_found bigint;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb'
  THEN RAISE EXCEPTION 'Only CAN OS Neon main permitted'; END IF;
  IF to_regclass('education_v30.persons') IS NULL
    OR to_regclass('public.people') IS NULL
    OR EXISTS(SELECT 1 FROM education_v30.persons)
  THEN RAISE EXCEPTION 'Unexpected native Person records or missing identity tables'; END IF;
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('statement_timeout','90s',true);
  FOR expected IN SELECT * FROM (VALUES
    ('class_enrollment_approval_requests','applicant_person_id','class_enrollment_approval_requests_applicant_person_id_fkey'),
    ('class_enrollment_approval_requests','guardian_person_id','class_enrollment_approval_requests_guardian_person_id_fkey'),
    ('class_enrollment_approval_requests','learner_person_id','class_enrollment_approval_requests_learner_person_id_fkey'),
    ('class_enrollment_invitations','learner_person_id','class_enrollment_invitations_learner_person_id_fkey'),
    ('class_enrollment_repeat_authorizations','learner_person_id','class_enrollment_repeat_authorizations_learner_person_id_fkey'),
    ('class_enrollment_transfer_requests','learner_person_id','class_enrollment_transfer_requests_learner_person_id_fkey'),
    ('facilitated_room_assisted_activity_evidence','learner_person_id','facilitated_room_assisted_activity_evide_learner_person_id_fkey')
  ) AS reviewed(table_name,column_name,constraint_name) LOOP
    source_rel:=to_regclass('public.'||expected.table_name)::oid;
    IF source_rel IS NULL OR NOT EXISTS (SELECT 1 FROM pg_class c
      WHERE c.oid=source_rel AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
      OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=source_rel)<>1
    THEN RAISE EXCEPTION 'Unexpected Class/facilitator table or RLS: %',expected.table_name; END IF;
    SELECT c.oid,c.confrelid,c.convalidated,c.condeferrable,c.condeferred,
      c.confupdtype,c.confdeltype,cardinality(c.conkey) AS source_columns,
      cardinality(c.confkey) AS target_columns,pg_get_constraintdef(c.oid) AS definition
      INTO fk
    FROM pg_constraint c
    WHERE c.conrelid=source_rel AND c.conname=expected.constraint_name AND c.contype='f';
    IF NOT FOUND OR NOT fk.convalidated OR fk.condeferrable OR fk.condeferred
      OR fk.confupdtype<>'a' OR fk.confdeltype<>'a'
      OR fk.source_columns<>1 OR fk.target_columns<>1
    THEN RAISE EXCEPTION 'Unexpected exact Person FK %',expected.constraint_name; END IF;
    expected_def:=format('FOREIGN KEY (%I) REFERENCES education_v30.persons(id)',expected.column_name);
    IF fk.confrelid=to_regclass('public.people') THEN
      IF fk.definition IS DISTINCT FROM
        format('FOREIGN KEY (%I) REFERENCES people(id)',expected.column_name)
       AND fk.definition IS DISTINCT FROM
        format('FOREIGN KEY (%I) REFERENCES public.people(id)',expected.column_name)
      THEN RAISE EXCEPTION 'Previously rebound FK differs: %',expected.constraint_name; END IF;
      CONTINUE;
    END IF;
    IF fk.confrelid IS DISTINCT FROM to_regclass('education_v30.persons')
      OR fk.definition IS DISTINCT FROM expected_def
    THEN RAISE EXCEPTION 'Unreviewed native Person FK definition %',expected.constraint_name; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I',expected.table_name) INTO rows_found;
    IF rows_found<>0 THEN RAISE EXCEPTION 'Class/facilitator table % contains % records',expected.table_name,rows_found; END IF;
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
      expected.table_name,expected.constraint_name);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)',
      expected.table_name,expected.constraint_name,expected.column_name);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c
      WHERE c.conrelid=source_rel AND c.conname=expected.constraint_name
        AND c.contype='f' AND c.confrelid=to_regclass('public.people')
        AND c.convalidated AND NOT c.condeferrable
        AND c.confupdtype='a' AND c.confdeltype='a')
    THEN RAISE EXCEPTION 'Exact Person FK rebind failed %',expected.constraint_name; END IF;
  END LOOP;
END
$public_class_person_fk_cutover$;
