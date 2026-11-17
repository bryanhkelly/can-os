-- Use one authoritative public Person ID for education operations.
-- Seven empty public operational tables only, not identity review/alias tables.
-- No new Person IDs, no matching by name/email, no RLS or grant changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $preflight$
DECLARE item record; count_rows bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not CAN OS main'; END IF;
 IF to_regclass('public.people') IS NULL
 THEN RAISE EXCEPTION 'Authoritative Person table unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM education_v30.persons n
    WHERE NOT EXISTS(SELECT 1 FROM public.people p WHERE p.id=n.id))
 THEN RAISE EXCEPTION 'Canonical Person is not in platform People'; END IF;
 FOR item IN SELECT * FROM (VALUES
    ('funding_program_versions','funding_program_versions_reviewed_by_person_id_fkey','reviewed_by_person_id'),
    ('institutional_approvals','institutional_approvals_reviewer_person_id_fkey','reviewer_person_id'),
    ('operation_safety_reviews','operation_safety_reviews_reviewer_person_id_fkey','reviewer_person_id'),
    ('professional_availability_windows','professional_availability_windows_person_id_fkey','person_id'),
    ('professional_service_offerings','professional_service_offerings_professional_person_id_fkey','professional_person_id'),
    ('professional_specialties','professional_specialties_person_id_fkey','person_id'),
    ('verified_contact_hours','verified_contact_hours_verified_by_person_id_fkey','verified_by_person_id')
 ) AS selected(table_name,constraint_name,column_name) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',item.table_name) INTO count_rows;
  IF count_rows<>0 THEN RAISE EXCEPTION 'Operational table populated: %',item.table_name; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c
    WHERE c.conrelid=to_regclass('public.'||item.table_name)
      AND c.conname=item.constraint_name
      AND c.contype='f' AND c.confrelid='education_v30.persons'::regclass
      AND pg_get_constraintdef(c.oid)=
        'FOREIGN KEY ('||item.column_name||') REFERENCES education_v30.persons(id)'
  ) THEN RAISE EXCEPTION 'Changed Person FK: %',item.constraint_name; END IF;
 END LOOP;
END $preflight$;
DO $migrate$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('funding_program_versions','funding_program_versions_reviewed_by_person_id_fkey','reviewed_by_person_id'),
    ('institutional_approvals','institutional_approvals_reviewer_person_id_fkey','reviewer_person_id'),
    ('operation_safety_reviews','operation_safety_reviews_reviewer_person_id_fkey','reviewer_person_id'),
    ('professional_availability_windows','professional_availability_windows_person_id_fkey','person_id'),
    ('professional_service_offerings','professional_service_offerings_professional_person_id_fkey','professional_person_id'),
    ('professional_specialties','professional_specialties_person_id_fkey','person_id'),
    ('verified_contact_hours','verified_contact_hours_verified_by_person_id_fkey','verified_by_person_id')
 ) AS selected(table_name,constraint_name,column_name) LOOP
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)',
    item.table_name,item.constraint_name,item.constraint_name,item.column_name);
 END LOOP;
END $migrate$;
DO $verify$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('funding_program_versions','funding_program_versions_reviewed_by_person_id_fkey','reviewed_by_person_id'),
    ('institutional_approvals','institutional_approvals_reviewer_person_id_fkey','reviewer_person_id'),
    ('operation_safety_reviews','operation_safety_reviews_reviewer_person_id_fkey','reviewer_person_id'),
    ('professional_availability_windows','professional_availability_windows_person_id_fkey','person_id'),
    ('professional_service_offerings','professional_service_offerings_professional_person_id_fkey','professional_person_id'),
    ('professional_specialties','professional_specialties_person_id_fkey','person_id'),
    ('verified_contact_hours','verified_contact_hours_verified_by_person_id_fkey','verified_by_person_id')
 ) AS selected(table_name,constraint_name,column_name) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c
    WHERE c.conrelid=to_regclass('public.'||item.table_name)
      AND c.conname=item.constraint_name AND c.contype='f' AND c.convalidated
      AND c.confrelid='public.people'::regclass)
  THEN RAISE EXCEPTION 'Person FK did not cut over: %',item.constraint_name; END IF;
 END LOOP;
END $verify$;
COMMIT;
