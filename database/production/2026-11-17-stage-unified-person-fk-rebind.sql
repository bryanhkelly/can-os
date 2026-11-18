-- CAN OS P0 | STAGED ONLY: unify all native Person FK targets.
--
-- DO NOT APPLY independently of the single-login / one-Person application
-- release, role and RLS migration, evidence retention and reviewer approval.
-- On 2026-11-17 Neon main now has 36 remaining validated references to
-- education_v30.persons and ZERO native Person/account records.
--
-- This migration does NOT copy People, infer identity by email, create an
-- account crosswalk, alter historical CAN grants, or retire any table.
-- It moves only existing FK enforcement to the authoritative public.people.
--
-- Production operator must first prove current code, permissions, independent
-- approvals, browser journeys and rollback plan, then explicitly set:
--   SET can.one_person_runtime_cutover_verified = 'yes';
--   SET can.one_person_fk_rebind_approved = 'yes';
-- in the SAME session before executing this file.
-- This file is NOT wired into the automatic Drizzle migration journal.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

DO $guarded_one_person_fk_rebind$
DECLARE
  dependency RECORD;
  sourcedata bigint;
  old_count integer;
  rebound_count integer := 0;
  definition text;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
     OR current_database() <> 'neondb'
  THEN
    RAISE EXCEPTION 'Refusing to alter any database other than CAN OS Neon main';
  END IF;

  IF current_setting('can.one_person_runtime_cutover_verified',true)
       IS DISTINCT FROM 'yes'
     OR current_setting('can.one_person_fk_rebind_approved',true)
       IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'One-Person code, staff approval, RLS and deployment must pass independent release verification first';
  END IF;

  IF EXISTS(SELECT 1 FROM education_v30.persons)
     OR EXISTS(SELECT 1 FROM education_v30.canonical_accounts)
     OR EXISTS(SELECT 1 FROM education_v30.canonical_sessions
        WHERE revoked_at IS NULL AND expires_at>clock_timestamp())
     OR EXISTS(SELECT 1 FROM public.access_account_canonical_principals)
     OR EXISTS(SELECT 1 FROM public.access_account_noncredit_principals)
     OR EXISTS(SELECT 1 FROM public.access_adult_learning_reviews
        WHERE canonical_person_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'Active native identities or correspondence require evidence-preserving migration';
  END IF;

  IF EXISTS(SELECT 1 FROM public.account_person_grants g
     JOIN public.access_accounts a ON a.id=g.account_id
     WHERE g.active AND a.person_id IS DISTINCT FROM g.person_id)
     OR EXISTS(SELECT 1 FROM public.access_accounts WHERE person_id IS NULL)
  THEN
    RAISE EXCEPTION 'Current CAN account and Person ownership must agree before FK cutover';
  END IF;

  SELECT count(*) INTO old_count
    FROM pg_constraint
   WHERE contype='f' AND confrelid='education_v30.persons'::regclass;
  IF old_count <> 36 THEN
    RAISE EXCEPTION 'Native Person FK graph changed: expected 36, found %',old_count;
  END IF;

  -- Any composite, unvalidated or non-id reference is outside this reviewed
  -- one-column Person graph. Fail before attempting to alter any FK.
  IF EXISTS(
    SELECT 1 FROM pg_constraint c
    WHERE c.contype='f' AND c.confrelid='education_v30.persons'::regclass
      AND (NOT c.convalidated OR cardinality(c.conkey)<>1
        OR cardinality(c.confkey)<>1
        OR pg_get_constraintdef(c.oid) NOT LIKE
           '%REFERENCES education_v30.persons(id)%')
  ) THEN
    RAISE EXCEPTION 'Unreviewed native Person FK definition or validation state';
  END IF;

  FOR dependency IN
    SELECT n.nspname AS schema_name, t.relname AS table_name,
           a.attname AS column_name, c.conname AS constraint_name,
           pg_get_constraintdef(c.oid) AS fk_definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1]
     WHERE c.contype='f' AND c.confrelid='education_v30.persons'::regclass
     ORDER BY n.nspname,t.relname,c.conname
  LOOP
    -- Since native Persons are empty and FKs are validated these source
    -- columns must also be null, but check every column explicitly.
    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE %I IS NOT NULL',
      dependency.schema_name,dependency.table_name,dependency.column_name
    ) INTO sourcedata;
    IF sourcedata<>0 THEN
      RAISE EXCEPTION 'Refusing nonempty native Person reference %.%.%',
        dependency.schema_name,dependency.table_name,dependency.column_name;
    END IF;

    definition := replace(dependency.fk_definition,
      'REFERENCES education_v30.persons(id)',
      'REFERENCES public.people(id)');
    IF definition=dependency.fk_definition THEN
      RAISE EXCEPTION 'Person FK format not recognized for %',
        dependency.constraint_name;
    END IF;
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
      dependency.schema_name,dependency.table_name,dependency.constraint_name);
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
      dependency.schema_name,dependency.table_name,
      dependency.constraint_name,definition);
    rebound_count := rebound_count+1;
  END LOOP;

  IF rebound_count<>old_count OR EXISTS(
    SELECT 1 FROM pg_constraint
     WHERE contype='f' AND confrelid='education_v30.persons'::regclass
  ) THEN
    RAISE EXCEPTION 'Person FK rebind did not complete atomically';
  END IF;
  RAISE NOTICE 'Rebound % existing Person foreign keys to public.people (no identities copied)', rebound_count;
END
$guarded_one_person_fk_rebind$;

-- If any constraint, scan or lock fails, the transaction rolls back all changes.
COMMIT;
