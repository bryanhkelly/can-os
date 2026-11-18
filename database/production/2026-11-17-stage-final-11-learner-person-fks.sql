-- CAN OS Neon MAIN | STAGED. DO NOT RUN while native learner creation,
-- native Class onboarding, native bearer cookies or correspondence are live.
-- This covers the last 11 non-correspondence FKs referencing
-- education_v30.persons, including the existing ON DELETE RESTRICT rule.
-- The three public correspondence/adult-review FKs are intentionally excluded.
-- No Person or account migration, duplicate grants, bridge, CASCADE or alias.
--
-- An independent reviewer must certify a coordinated runtime/source cutover,
-- guardian/adult consent and evidence, scoped RLS, enrolment and revocation,
-- and set both session-local flags before manually applying:
--   SET can.one_person_runtime_cutover_verified = 'yes';
--   SET can.remaining_learner_person_fk_rebind_approved = 'yes';
DO $stage_final_learner_fk_cutover$
DECLARE
  link record;
  source_rel oid;
  metadata record;
  old_definition text;
  incoming bigint;
  modified integer := 0;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database() <> 'neondb'
  THEN RAISE EXCEPTION 'Only CAN OS Neon MAIN permitted'; END IF;
  IF current_setting('can.one_person_runtime_cutover_verified',true) IS DISTINCT FROM 'yes'
    OR current_setting('can.remaining_learner_person_fk_rebind_approved',true) IS DISTINCT FROM 'yes'
  THEN RAISE EXCEPTION 'Approved one-Person learner/guardian runtime cutover is required'; END IF;
  IF to_regclass('education_v30.persons') IS NULL OR
     to_regclass('public.people') IS NULL OR
     EXISTS(SELECT 1 FROM education_v30.persons) OR
     EXISTS(SELECT 1 FROM education_v30.canonical_accounts) OR
     EXISTS(SELECT 1 FROM education_v30.canonical_sessions
        WHERE revoked_at IS NULL AND expires_at>clock_timestamp())
  THEN RAISE EXCEPTION 'Unexpected active native identity or missing public People'; END IF;
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('statement_timeout','120s',true);

  CREATE TEMP TABLE IF NOT EXISTS _can_final_learner_person_fks (
    table_name text,column_name text,constraint_name text,delete_action char(1)
  ) ON COMMIT DROP;
  TRUNCATE TABLE _can_final_learner_person_fks;
  INSERT INTO _can_final_learner_person_fks VALUES
    ('canonical_account_grants','person_id','canonical_account_grants_person_id_fkey','a'),
    ('class_enrollments','enrolled_by_person_id','class_enrollments_enrolled_by_person_id_fkey','a'),
    ('class_enrollments','learner_person_id','class_enrollments_learner_person_id_fkey','a'),
    ('facilitated_learning_participants','participant_person_id','facilitated_pairs_person_fk','a'),
    ('learner_achievement_decisions','recipient_person_id','learner_achievement_decisions_recipient_person_id_fkey','a'),
    ('learner_profiles','person_id','learner_profiles_person_id_fkey','a'),
    ('learning_completion_evidence_bindings','participant_person_id','learning_completion_evidence_binding_participant_person_id_fkey','a'),
    ('learning_completion_evidence_review_requests','participant_person_id','learning_completion_evidence_review__participant_person_id_fkey','a'),
    ('learning_sessions','participant_person_id','canonical_learning_sessions_person_fk','a'),
    ('noncredit_registrations','participant_person_id','noncredit_registrations_participant_person_id_fkey','a'),
    ('noncredit_self_enrollment_claims','participant_person_id','noncredit_self_enrollment_claims_participant_person_id_fkey','r');
  IF (SELECT count(*) FROM _can_final_learner_person_fks)<>11 OR
     (SELECT count(DISTINCT(table_name,column_name,constraint_name))
        FROM _can_final_learner_person_fks)<>11
  THEN RAISE EXCEPTION 'Unexpected reviewed learner Person FK list'; END IF;

  FOR link IN SELECT * FROM _can_final_learner_person_fks ORDER BY table_name,column_name LOOP
    source_rel:=to_regclass('education_v30.'||link.table_name)::oid;
    IF source_rel IS NULL THEN RAISE EXCEPTION 'Missing learner table %',link.table_name; END IF;
    SELECT c.oid,c.confrelid,c.convalidated,c.condeferrable,c.condeferred,
           c.confdeltype,c.confupdtype,cardinality(c.conkey) AS source_count,
           cardinality(c.confkey) AS target_count,a.attname AS actual_column,
           pg_get_constraintdef(c.oid) AS definition
    INTO metadata
    FROM pg_constraint c JOIN pg_attribute a
      ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    WHERE c.conrelid=source_rel AND c.conname=link.constraint_name
      AND c.contype='f';
    IF NOT FOUND OR NOT metadata.convalidated OR metadata.condeferrable OR
       metadata.condeferred OR metadata.confdeltype<>link.delete_action OR
       metadata.confupdtype<>'a' OR metadata.source_count<>1 OR
       metadata.target_count<>1 OR metadata.actual_column<>link.column_name OR
       metadata.confrelid NOT IN
         (to_regclass('education_v30.persons'),to_regclass('public.people'))
    THEN RAISE EXCEPTION 'Learner Person FK metadata changed: %',link.constraint_name; END IF;
    old_definition:=format('FOREIGN KEY (%I) REFERENCES education_v30.persons(id)',link.column_name);
    IF link.delete_action='r' THEN old_definition:=old_definition||' ON DELETE RESTRICT'; END IF;
    IF metadata.confrelid=to_regclass('education_v30.persons') AND
       metadata.definition IS DISTINCT FROM old_definition
    THEN RAISE EXCEPTION 'Learner Person FK action changed: %',link.constraint_name; END IF;
    IF metadata.confrelid=to_regclass('education_v30.persons') THEN
      EXECUTE format('SELECT count(*) FROM education_v30.%I',link.table_name) INTO incoming;
      IF incoming<>0 THEN RAISE EXCEPTION 'Learner history found on %: % records',link.table_name,incoming; END IF;
    END IF;
  END LOOP;

  -- All preflight checks complete. PostgreSQL rolls the whole DO block back
  -- if any constraint cannot be rebound; no intermediate unsafe schema.
  FOR link IN SELECT * FROM _can_final_learner_person_fks ORDER BY table_name,column_name LOOP
    source_rel:=to_regclass('education_v30.'||link.table_name)::oid;
    SELECT c.confrelid INTO metadata
      FROM pg_constraint c
      WHERE c.conrelid=source_rel AND c.conname=link.constraint_name;
    IF metadata.confrelid=to_regclass('public.people') THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I',
      link.table_name,link.constraint_name);
    EXECUTE format(
      'ALTER TABLE education_v30.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)%s',
      link.table_name,link.constraint_name,link.column_name,
      CASE WHEN link.delete_action='r' THEN ' ON DELETE RESTRICT' ELSE '' END
    );
    modified:=modified+1;
  END LOOP;
  IF EXISTS(SELECT 1 FROM _can_final_learner_person_fks link
    JOIN pg_class t ON t.oid=to_regclass('education_v30.'||link.table_name)
    LEFT JOIN pg_constraint c ON c.conrelid=t.oid AND c.conname=link.constraint_name
    WHERE c.oid IS NULL OR c.confrelid IS DISTINCT FROM to_regclass('public.people')
      OR NOT c.convalidated OR c.condeferrable OR c.confdeltype<>link.delete_action
      OR c.confupdtype<>'a')
  THEN RAISE EXCEPTION 'Learner Person FK cutover failed verification'; END IF;
  RAISE NOTICE 'Cut over % learner FKs, retaining existing history and delete actions',modified;
END
$stage_final_learner_fk_cutover$;
