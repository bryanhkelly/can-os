-- Consolidate direct Site references for four already relocated public tables.
-- No bridge. Preserve constraint names, row IDs and FK semantics.
-- Narrow migration: four empty operational tables only, not a blanket FK rewrite.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
DECLARE entry record; oid_ref oid; current_rows bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not actual CAN OS Neon main'; END IF;
 IF to_regclass('public.sites') IS NULL THEN RAISE EXCEPTION 'Shared Site table missing'; END IF;
 FOR entry IN SELECT * FROM (VALUES
    ('deployment_organization_roles','deployment_organization_roles_site_id_fkey'),
    ('institutional_approvals','institutional_approvals_site_id_fkey'),
    ('operation_calendar_days','operation_calendar_days_site_id_fkey'),
    ('operation_safety_requirements','operation_safety_requirements_site_id_fkey')
 ) AS expected(table_name,constraint_name) LOOP
  oid_ref:=to_regclass('public.'||entry.table_name);
  IF oid_ref IS NULL THEN RAISE EXCEPTION 'Operational table missing: %',entry.table_name; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',entry.table_name) INTO current_rows;
  IF current_rows<>0 THEN RAISE EXCEPTION 'Operational data changed: %',entry.table_name; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint c WHERE c.conrelid=oid_ref
      AND c.conname=entry.constraint_name AND c.contype='f'
      AND pg_get_constraintdef(c.oid)='FOREIGN KEY (site_id) REFERENCES education_v30.sites(id)'
  ) THEN RAISE EXCEPTION 'Unexpected FK shape on %',entry.table_name; END IF;
 END LOOP;
END $guard$;
ALTER TABLE public.deployment_organization_roles
  DROP CONSTRAINT deployment_organization_roles_site_id_fkey,
  ADD CONSTRAINT deployment_organization_roles_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);
ALTER TABLE public.institutional_approvals
  DROP CONSTRAINT institutional_approvals_site_id_fkey,
  ADD CONSTRAINT institutional_approvals_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);
ALTER TABLE public.operation_calendar_days
  DROP CONSTRAINT operation_calendar_days_site_id_fkey,
  ADD CONSTRAINT operation_calendar_days_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);
ALTER TABLE public.operation_safety_requirements
  DROP CONSTRAINT operation_safety_requirements_site_id_fkey,
  ADD CONSTRAINT operation_safety_requirements_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);
DO $verify$
DECLARE entry record;
BEGIN
 FOR entry IN SELECT * FROM (VALUES
    ('deployment_organization_roles','deployment_organization_roles_site_id_fkey'),
    ('institutional_approvals','institutional_approvals_site_id_fkey'),
    ('operation_calendar_days','operation_calendar_days_site_id_fkey'),
    ('operation_safety_requirements','operation_safety_requirements_site_id_fkey')
 ) AS expected(table_name,constraint_name) LOOP
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.'||entry.table_name)
      AND c.conname=entry.constraint_name AND c.contype='f' AND c.convalidated
      AND c.confrelid='public.sites'::regclass
  ) THEN RAISE EXCEPTION 'Site FK cutover failed on %',entry.table_name; END IF;
 END LOOP;
END $verify$;
COMMIT;
