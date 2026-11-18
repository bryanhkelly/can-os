-- CAN OS Neon main: preserve separate safeguarding SECURITY SCHEMA,
-- while converging reporter, case opener and authorized custodian identity
-- to the ONE authoritative public.people. The secure data stays encrypted/
-- RLS-protected under education_v30_secure; this is a foreign-key change only.
-- No safeguarding evidence, sensitive identity, reporting data, role or
-- grant is copied or logged. All four source tables must still be empty.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
DECLARE r record; prior text; existing bigint; row_rls bool;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' THEN RAISE EXCEPTION 'Wrong Neon branch'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE contype='f'
 AND confrelid='education_v30.persons'::regclass)<>41
 THEN RAISE EXCEPTION 'Unreviewed Person FK graph'; END IF;
 IF (SELECT count(*) FROM education_v30.persons)<>0
 THEN RAISE EXCEPTION 'Native Person records require reconciliation'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
 WHERE oid='public.people'::regclass)
 THEN RAISE EXCEPTION 'Authoritative People not secured'; END IF;
 FOR r IN SELECT * FROM (VALUES
    ('safeguarding_cases','safeguarding_cases_opened_by_person_id_fkey','opened_by_person_id'),
    ('safeguarding_evidence','safeguarding_evidence_added_by_person_id_fkey','added_by_person_id'),
    ('safeguarding_identity_escrow','safeguarding_identity_escrow_authorized_custodian_person_i_fkey','authorized_custodian_person_id'),
    ('safeguarding_identity_escrow','safeguarding_identity_escrow_reporter_person_id_fkey','reporter_person_id'),
    ('safeguarding_reports','safeguarding_reports_reporting_person_id_fkey','reporting_person_id')
) AS s(table_name,constraint_name,column_name) LOOP
  SELECT pg_get_constraintdef(c.oid) INTO prior FROM pg_constraint c
  WHERE c.conrelid=to_regclass('education_v30_secure.'||r.table_name)
   AND c.confrelid='education_v30.persons'::regclass
   AND c.conname=r.constraint_name AND c.contype='f'
   AND c.convalidated AND NOT c.condeferrable;
  IF prior IS DISTINCT FROM
  ('FOREIGN KEY ('||r.column_name||') REFERENCES education_v30.persons(id)')
  THEN RAISE EXCEPTION 'Sensitive Person reference altered: %',r.constraint_name; END IF;
  SELECT relrowsecurity AND relforcerowsecurity INTO row_rls FROM pg_class
   WHERE oid=to_regclass('education_v30_secure.'||r.table_name);
  IF NOT row_rls THEN RAISE EXCEPTION 'Safeguarding RLS not forced: %',r.table_name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30_secure.%I',r.table_name) INTO existing;
  IF existing<>0 THEN RAISE EXCEPTION 'Sensitive records require review: %',r.table_name; END IF;
 END LOOP;
END $guard$;
DO $migrate$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
    ('safeguarding_cases','safeguarding_cases_opened_by_person_id_fkey','opened_by_person_id'),
    ('safeguarding_evidence','safeguarding_evidence_added_by_person_id_fkey','added_by_person_id'),
    ('safeguarding_identity_escrow','safeguarding_identity_escrow_authorized_custodian_person_i_fkey','authorized_custodian_person_id'),
    ('safeguarding_identity_escrow','safeguarding_identity_escrow_reporter_person_id_fkey','reporter_person_id'),
    ('safeguarding_reports','safeguarding_reports_reporting_person_id_fkey','reporting_person_id')
) AS s(table_name,constraint_name,column_name) LOOP
  EXECUTE format('ALTER TABLE education_v30_secure.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)',
   r.table_name,r.constraint_name,r.constraint_name,r.column_name);
 END LOOP;
END $migrate$;
DO $verify$
DECLARE r record; prior text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
    ('safeguarding_cases','safeguarding_cases_opened_by_person_id_fkey','opened_by_person_id'),
    ('safeguarding_evidence','safeguarding_evidence_added_by_person_id_fkey','added_by_person_id'),
    ('safeguarding_identity_escrow','safeguarding_identity_escrow_authorized_custodian_person_i_fkey','authorized_custodian_person_id'),
    ('safeguarding_identity_escrow','safeguarding_identity_escrow_reporter_person_id_fkey','reporter_person_id'),
    ('safeguarding_reports','safeguarding_reports_reporting_person_id_fkey','reporting_person_id')
) AS s(table_name,constraint_name,column_name) LOOP
  SELECT pg_get_constraintdef(c.oid) INTO prior FROM pg_constraint c
  WHERE c.conrelid=to_regclass('education_v30_secure.'||r.table_name)
    AND c.confrelid='public.people'::regclass AND c.contype='f'
    AND c.convalidated AND c.conname=r.constraint_name;
  IF prior IS DISTINCT FROM ('FOREIGN KEY ('||r.column_name||') REFERENCES people(id)')
  THEN RAISE EXCEPTION 'Safeguarding Person FK did not converge: %',r.constraint_name; END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
  WHERE oid=to_regclass('education_v30_secure.'||r.table_name))
  THEN RAISE EXCEPTION 'Safeguarding RLS unexpectedly relaxed'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_constraint WHERE contype='f'
 AND confrelid='education_v30.persons'::regclass)<>36
 THEN RAISE EXCEPTION 'Remaining Person graph changed'; END IF;
END $verify$;
COMMIT;
