-- CAN OS: one authoritative Person for native publisher Course appointments.
-- PREPARED, NOT AUTO-APPLIED. Run with explicit production schema-change
-- approval after read-only preflight and runtime acceptance.
--
-- Rebind existing empty appointment/person capability FKs to public.people.
-- No Person inserts, no correspondence table, no automatic role grants,
-- no suspension of RLS, no Course/Offering publication.
-- If either table is no longer empty or the constraints have changed,
-- fail and reconcile independently instead of guessing.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

DO $cutover$
DECLARE
  entry record;
  fk record;
  has_rows boolean;
BEGIN
  IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
     OR current_database()<>'neondb'
  THEN
    RAISE EXCEPTION 'Refusing anything except the approved CAN OS Neon main';
  END IF;
  IF to_regclass('public.people') IS NULL
     OR to_regclass('education_v30.persons') IS NULL
  THEN RAISE EXCEPTION 'Expected identity tables are missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.people) THEN
    RAISE EXCEPTION 'Authoritative public.people is not provisioned';
  END IF;
  IF EXISTS(SELECT 1 FROM education_v30.persons) THEN
    RAISE EXCEPTION 'Native Person data needs evidence-preserving reconciliation';
  END IF;

  FOR entry IN SELECT * FROM (VALUES
    ('professional_role_assignments',
     'professional_role_assignments_person_id_fkey'),
    ('professional_capability_authorizations',
     'professional_capability_authorizations_person_id_fkey')
  ) AS v(table_name,constraint_name)
  LOOP
    SELECT con.oid,con.conrelid,con.confrelid,con.convalidated,
      pg_get_constraintdef(con.oid) definition
      INTO fk
    FROM pg_constraint con
    WHERE con.conname=entry.constraint_name
      AND con.conrelid=to_regclass('education_v30.'||entry.table_name)
      AND con.contype='f';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing or renamed professional Person FK: %',
        entry.constraint_name;
    END IF;
    IF fk.confrelid='public.people'::regclass THEN
      IF NOT fk.convalidated OR fk.definition NOT LIKE 'FOREIGN KEY (person_id) %'
      THEN RAISE EXCEPTION 'Unexpected previously rebound Person FK: %',
        entry.constraint_name; END IF;
      CONTINUE;
    END IF;
    IF fk.confrelid<>'education_v30.persons'::regclass
       OR NOT fk.convalidated
       OR fk.definition NOT LIKE 'FOREIGN KEY (person_id) %'
    THEN
      RAISE EXCEPTION 'Unexpected existing Person FK contract: %',
        entry.constraint_name;
    END IF;

    EXECUTE format('SELECT EXISTS(SELECT 1 FROM education_v30.%I)',
      entry.table_name) INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Professional grant table has data; stop for reconciliation: %',
        entry.table_name;
    END IF;

    EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I',
      entry.table_name,entry.constraint_name);
    EXECUTE format(
      'ALTER TABLE education_v30.%I ADD CONSTRAINT %I FOREIGN KEY (person_id) REFERENCES public.people(id) NOT VALID',
      entry.table_name,entry.constraint_name);
    EXECUTE format('ALTER TABLE education_v30.%I VALIDATE CONSTRAINT %I',
      entry.table_name,entry.constraint_name);
  END LOOP;

  IF EXISTS(
    SELECT 1 FROM pg_constraint con
    WHERE con.conname IN (
      'professional_role_assignments_person_id_fkey',
      'professional_capability_authorizations_person_id_fkey')
      AND con.confrelid<>'public.people'::regclass
  ) THEN
    RAISE EXCEPTION 'Professional identity cutover did not converge';
  END IF;
END $cutover$;
COMMIT;

-- Read-only post-apply verification:
-- SELECT conrelid::regclass,conname,confrelid::regclass,convalidated
-- FROM pg_constraint
-- WHERE conname IN ('professional_role_assignments_person_id_fkey',
--   'professional_capability_authorizations_person_id_fkey');
