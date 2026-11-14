-- One-time repair for the partially installed canonical v3.0.1 test01 branch.
-- The fresh-install schema.sql already includes the two Blueprint purposes.
-- Run ONLY against the disposable can-os Neon test01 branch after reviewing.
-- psql -v ON_ERROR_STOP=1 "$TEST_DATABASE_URL" -f this-file
-- No live deployment or production database should run this repair.
BEGIN;
DO $test01_blueprint_purposes$
DECLARE current_definition text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM education_v30.canonical_accounts
     WHERE email_normalized='valor.admin@can.example')
     OR NOT EXISTS (SELECT 1 FROM education_v30.blueprint_versions
       WHERE lifecycle='published') THEN
    RAISE EXCEPTION 'This repair requires the isolated v3.0.1 test01 demo fixture';
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO current_definition
    FROM pg_constraint c
    WHERE c.conrelid='education_v30.database_role_organization_bindings'::regclass
      AND c.conname='database_role_organization_bindings_purpose_code_check';
  IF current_definition IS NULL THEN
    RAISE EXCEPTION 'Cannot identify the existing database-role purpose constraint';
  END IF;
  IF current_definition LIKE '%blueprint_author%'
     AND current_definition LIKE '%blueprint_reviewer%' THEN
    RAISE NOTICE 'Blueprint purposes already present; no repair needed';
    RETURN;
  END IF;
  IF current_definition NOT LIKE '%training_registration%'
     OR current_definition NOT LIKE '%network_reporting%' THEN
    RAISE EXCEPTION 'Unexpected database-role purpose constraint; review manually';
  END IF;
  -- DDL is atomic. Replace only the stale enum-like CHECK with the exact
  -- approved purpose list from the canonical v3.0.1 fresh-install schema.
  ALTER TABLE education_v30.database_role_organization_bindings
    DROP CONSTRAINT database_role_organization_bindings_purpose_code_check;
  ALTER TABLE education_v30.database_role_organization_bindings
    ADD CONSTRAINT database_role_organization_bindings_purpose_code_check
    CHECK (purpose_code IN (
      'training_registration','equipment_inventory','technology_support',
      'read_only_reporting','qualification_application','qualification_evidence',
      'qualification_reviewer','program_catalog','program_fit',
      'program_activation','network_reporting','blueprint_author',
      'blueprint_reviewer'
    ));
END
$test01_blueprint_purposes$;
COMMIT;
