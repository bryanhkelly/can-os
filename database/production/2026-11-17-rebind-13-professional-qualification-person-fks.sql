-- CAN OS Neon MAIN | Native Person foreign-key cutover, batch 13.
-- Rebind 13 exact validated, single-column FKs on 12 EMPTY native tables
-- to public.people. NO Person copy, account matching, new identity aliases,
-- RLS changes, ownership changes, table drops, or CASCADE.
-- Maintain existing FK names, NO ACTION update/delete, and validation.
-- Do not wire this manually controlled release into Drizzle auto migrations.
DO $rebind_thirteen_native_people_fks$
DECLARE
  rule record;
  rel oid;
  previous record;
  ref_count bigint;
  rewritten integer := 0;
BEGIN
  IF current_setting('neon.project_id', true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id', true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'CAN OS Neon production main required';
  END IF;
  IF to_regclass('education_v30.persons') IS NULL
     OR to_regclass('public.people') IS NULL
     OR EXISTS(SELECT 1 FROM education_v30.persons)
  THEN RAISE EXCEPTION 'Native Persons not empty or authoritative People missing'; END IF;
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '120s', true);
  CREATE TEMP TABLE IF NOT EXISTS _can_person_fk_release_preflight (
    table_name text, column_name text, constraint_name text
  ) ON COMMIT DROP;
  TRUNCATE TABLE _can_person_fk_release_preflight;
  INSERT INTO _can_person_fk_release_preflight VALUES
    ('creator_commissions','creator_person_id','creator_commissions_creator_person_id_fkey'),
    ('equipment_assignments','participant_person_id','equipment_assignments_participant_person_id_fkey'),
    ('improvement_actions','action_owner_person_id','improvement_actions_action_owner_person_id_fkey'),
    ('participant_technology_assessments','assessor_person_id','participant_technology_assessments_assessor_person_id_fkey'),
    ('participant_technology_assessments','participant_person_id','participant_technology_assessments_participant_person_id_fkey'),
    ('professional_capability_authorizations','person_id','professional_capability_authorizations_person_id_fkey'),
    ('professional_role_assignments','person_id','professional_role_assignments_person_id_fkey'),
    ('professional_screening_decisions','person_id','professional_screening_decisions_person_id_fkey'),
    ('qualification_applications','contact_person_id','qualification_applications_contact_person_id_fkey'),
    ('qualification_person_consents','subject_person_id','qualification_person_consents_subject_person_id_fkey'),
    ('qualification_subjects','person_id','qualification_subjects_person_id_fkey'),
    ('survey_invitations','invited_person_id','survey_invitations_invited_person_id_fkey'),
    ('workforce_compensation_agreements','payee_person_id','workforce_compensation_agreements_payee_person_id_fkey');
  IF (SELECT count(*) FROM _can_person_fk_release_preflight)<>13 OR
     (SELECT count(DISTINCT(table_name,column_name,constraint_name))
        FROM _can_person_fk_release_preflight)<>13 THEN
    RAISE EXCEPTION 'Unexpected native Person cutover graph';
  END IF;

  -- Validate the entire set before any FK is changed. Does not create Person
  -- records or conflate contact and independent professional authorization.
  FOR rule IN SELECT * FROM _can_person_fk_release_preflight
              ORDER BY table_name,column_name LOOP
    rel := to_regclass('education_v30.'||rule.table_name)::oid;
    IF rel IS NULL THEN RAISE EXCEPTION 'Missing source table %',rule.table_name; END IF;
    SELECT c.oid,c.confrelid,c.convalidated,c.condeferrable,c.condeferred,
           c.confdeltype,c.confupdtype,cardinality(c.conkey) AS key_count,
           cardinality(c.confkey) AS ref_count,
           a.attname AS source_column,pg_get_constraintdef(c.oid) AS definition
      INTO previous
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid
     AND a.attnum=c.conkey[1]
    WHERE c.conrelid=rel AND c.conname=rule.constraint_name
      AND c.contype='f';
    IF NOT FOUND OR NOT previous.convalidated OR previous.condeferrable OR
        previous.condeferred OR previous.confdeltype<>'a' OR
        previous.confupdtype<>'a' OR previous.key_count<>1 OR
        previous.ref_count<>1 OR previous.source_column<>rule.column_name OR
        previous.confrelid NOT IN
          (to_regclass('education_v30.persons'),to_regclass('public.people'))
    THEN RAISE EXCEPTION 'Native Person FK drift: %',rule.constraint_name; END IF;
    IF previous.confrelid=to_regclass('education_v30.persons') AND
        previous.definition IS DISTINCT FROM
         format('FOREIGN KEY (%I) REFERENCES education_v30.persons(id)',rule.column_name)
    THEN RAISE EXCEPTION 'Unexpected FK definition: %',rule.constraint_name; END IF;
    IF previous.confrelid=to_regclass('public.people') AND
       previous.definition NOT IN (
          format('FOREIGN KEY (%I) REFERENCES people(id)',rule.column_name),
          format('FOREIGN KEY (%I) REFERENCES public.people(id)',rule.column_name))
    THEN RAISE EXCEPTION 'Previously rebound FK changed: %',rule.constraint_name; END IF;
    -- A native table with an empty referenced Person population can still
    -- contain historical NULL rows. Require the whole source to be empty.
    IF previous.confrelid=to_regclass('education_v30.persons') THEN
      EXECUTE format('SELECT count(*) FROM education_v30.%I',rule.table_name)
        INTO ref_count;
      IF ref_count<>0 THEN RAISE EXCEPTION 'Nonempty source %, rows=%',
        rule.table_name,ref_count; END IF;
    END IF;
  END LOOP;

  FOR rule IN SELECT * FROM _can_person_fk_release_preflight
              ORDER BY table_name,column_name LOOP
    rel:=to_regclass('education_v30.'||rule.table_name)::oid;
    SELECT c.confrelid INTO previous
    FROM pg_constraint c WHERE c.conrelid=rel AND c.conname=rule.constraint_name;
    IF previous.confrelid=to_regclass('public.people') THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I',
      rule.table_name,rule.constraint_name);
    EXECUTE format('ALTER TABLE education_v30.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)',
      rule.table_name,rule.constraint_name,rule.column_name);
    rewritten:=rewritten+1;
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM _can_person_fk_release_preflight x
    JOIN pg_class t ON t.oid=to_regclass('education_v30.'||x.table_name)
    LEFT JOIN pg_constraint c ON c.conrelid=t.oid AND c.conname=x.constraint_name
    WHERE c.oid IS NULL OR c.confrelid IS DISTINCT FROM to_regclass('public.people')
      OR NOT c.convalidated OR c.condeferrable OR c.confdeltype<>'a' OR c.confupdtype<>'a'
  ) THEN RAISE EXCEPTION 'Native Person FK verification failed'; END IF;
  RAISE NOTICE 'Rebound % native Person foreign keys to public.people',rewritten;
END
$rebind_thirteen_native_people_fks$;
