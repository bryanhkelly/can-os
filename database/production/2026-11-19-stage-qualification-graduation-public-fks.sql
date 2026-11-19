-- CAN OS V6.1: staged public FK cutover for empty qualification/graduation consumers.
-- NOT AUTO-APPLIED. Review and explicitly authorize dropping old FK constraints.
-- Verified against Neon main 2026-11-19: all five public dependent tables and
-- both education_v30 parent tables contain zero rows.
-- Purpose: change FK targets only; do not drop parent tables in this step.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$
DECLARE entry record; n bigint;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database() <> 'neondb'
  THEN RAISE EXCEPTION 'Expected CAN OS production main'; END IF;
  FOR entry IN SELECT * FROM (VALUES
    ('qualification_definition_versions','definition_id','qualification_definitions'),
    ('qualification_operational_gates','definition_id','qualification_definitions'),
    ('qualification_reviewer_authorizations','definition_id','qualification_definitions'),
    ('credential_issuance_support','graduation_decision_id','graduation_decisions'),
    ('credential_issuances','graduation_decision_id','graduation_decisions')
  ) AS x(child_table,child_col,parent_table)
  LOOP
    IF to_regclass('public.'||entry.child_table) IS NULL
      OR to_regclass('public.'||entry.parent_table) IS NULL
      OR to_regclass('education_v30.'||entry.parent_table) IS NULL
    THEN RAISE EXCEPTION 'Missing expected table %',entry.child_table; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I',entry.child_table) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'Nonempty dependent table %; inspect data before cutover',entry.child_table; END IF;
    EXECUTE format('SELECT count(*) FROM education_v30.%I',entry.parent_table) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'Legacy parent % not empty',entry.parent_table; END IF;
  END LOOP;
END $guard$;
-- Add and validate authoritative constraints before removing legacy constraints.
ALTER TABLE public.qualification_definition_versions
  ADD CONSTRAINT qualification_definition_versions_definition_id_public_fkey
  FOREIGN KEY (definition_id) REFERENCES public.qualification_definitions(id);
ALTER TABLE public.qualification_operational_gates
  ADD CONSTRAINT qualification_operational_gates_definition_id_public_fkey
  FOREIGN KEY (definition_id) REFERENCES public.qualification_definitions(id);
ALTER TABLE public.qualification_reviewer_authorizations
  ADD CONSTRAINT qualification_reviewer_authorizations_definition_id_public_fkey
  FOREIGN KEY (definition_id) REFERENCES public.qualification_definitions(id);
ALTER TABLE public.credential_issuance_support
  ADD CONSTRAINT credential_issuance_support_graduation_decision_id_public_fkey
  FOREIGN KEY (graduation_decision_id) REFERENCES public.graduation_decisions(id);
ALTER TABLE public.credential_issuances
  ADD CONSTRAINT credential_issuances_graduation_decision_id_public_fkey
  FOREIGN KEY (graduation_decision_id) REFERENCES public.graduation_decisions(id);
ALTER TABLE public.qualification_definition_versions
  DROP CONSTRAINT qualification_definition_versions_definition_id_fkey;
ALTER TABLE public.qualification_operational_gates
  DROP CONSTRAINT qualification_operational_gates_definition_id_fkey;
ALTER TABLE public.qualification_reviewer_authorizations
  DROP CONSTRAINT qualification_reviewer_authorizations_definition_id_fkey;
ALTER TABLE public.credential_issuance_support
  DROP CONSTRAINT credential_issuance_support_graduation_decision_id_fkey;
ALTER TABLE public.credential_issuances
  DROP CONSTRAINT credential_issuances_graduation_decision_id_fkey;
-- No DROP TABLE here: preserve full review of application references and other dependencies.
COMMIT;
