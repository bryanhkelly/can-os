-- CAN OS, Neon main: transfer 11 core native Site foreign keys directly
-- onto the ONLY authoritative Site identity, public.sites(id).
-- No bridge, copied rows, new Site identity, or authorization grant.
-- Maintains all existing ON DELETE semantics and table RLS configuration.
-- Guards verify exact source DDL and every current row against public.sites.
-- Note: this is structural referential integrity, NOT an RLS completion gate.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$
DECLARE item record; old_definition text; bad_rows bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing non-main database'; END IF;
 IF to_regclass('public.sites') IS NULL OR to_regclass('education_v30.sites') IS NULL
 THEN RAISE EXCEPTION 'Required source or target Site absent'; END IF;
 FOR item IN SELECT * FROM (VALUES
    ('canonical_account_grants','canonical_account_grants_site_id_fkey',''),
    ('class_enrollment_approval_requests','class_enrollment_approval_requests_site_id_fkey',''),
    ('class_enrollment_invitations','class_enrollment_invitations_site_id_fkey',''),
    ('classes','classes_site_id_fkey',''),
    ('deployment_sites','deployment_sites_site_id_fkey',''),
    ('education_operation_sites','education_operation_sites_site_id_fkey',''),
    ('noncredit_self_enrollment_claims','noncredit_self_enrollment_claims_site_id_fkey',' ON DELETE RESTRICT'),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_releases_site_id_fkey',' ON DELETE RESTRICT'),
    ('site_device_registrations','site_device_registrations_site_id_fkey',''),
    ('site_organization_roles','site_organization_roles_site_id_fkey',''),
    ('site_publication_bindings','site_publication_bindings_site_id_fkey','')
 ) AS selected(table_name,constraint_name,delete_suffix)
 LOOP
   SELECT pg_get_constraintdef(c.oid) INTO old_definition
     FROM pg_constraint c
     WHERE c.contype='f' AND c.convalidated
       AND c.conrelid=to_regclass('education_v30.'||item.table_name)
       AND c.confrelid='education_v30.sites'::regclass
       AND c.conname=item.constraint_name;
   IF old_definition IS DISTINCT FROM
     ('FOREIGN KEY (site_id) REFERENCES education_v30.sites(id)'||item.delete_suffix)
   THEN RAISE EXCEPTION 'Changed Site relationship: %',item.constraint_name; END IF;
   EXECUTE format(
     'SELECT count(*) FROM education_v30.%I child LEFT JOIN public.sites platform ON platform.id=child.site_id WHERE child.site_id IS NOT NULL AND platform.id IS NULL',
     item.table_name) INTO bad_rows;
   IF bad_rows<>0 THEN RAISE EXCEPTION 'Foreign Site identity encountered in %',item.table_name; END IF;
 END LOOP;
END $guard$;

DO $migrate$
DECLARE item record; definition text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('canonical_account_grants','canonical_account_grants_site_id_fkey',''),
    ('class_enrollment_approval_requests','class_enrollment_approval_requests_site_id_fkey',''),
    ('class_enrollment_invitations','class_enrollment_invitations_site_id_fkey',''),
    ('classes','classes_site_id_fkey',''),
    ('deployment_sites','deployment_sites_site_id_fkey',''),
    ('education_operation_sites','education_operation_sites_site_id_fkey',''),
    ('noncredit_self_enrollment_claims','noncredit_self_enrollment_claims_site_id_fkey',' ON DELETE RESTRICT'),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_releases_site_id_fkey',' ON DELETE RESTRICT'),
    ('site_device_registrations','site_device_registrations_site_id_fkey',''),
    ('site_organization_roles','site_organization_roles_site_id_fkey',''),
    ('site_publication_bindings','site_publication_bindings_site_id_fkey','')
 ) AS selected(table_name,constraint_name,delete_suffix)
 LOOP
   definition:='FOREIGN KEY (site_id) REFERENCES public.sites(id)'||item.delete_suffix;
   EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',
     item.table_name,item.constraint_name,item.constraint_name,definition);
 END LOOP;
END $migrate$;

DO $verify$
DECLARE item record; old_definition text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('canonical_account_grants','canonical_account_grants_site_id_fkey',''),
    ('class_enrollment_approval_requests','class_enrollment_approval_requests_site_id_fkey',''),
    ('class_enrollment_invitations','class_enrollment_invitations_site_id_fkey',''),
    ('classes','classes_site_id_fkey',''),
    ('deployment_sites','deployment_sites_site_id_fkey',''),
    ('education_operation_sites','education_operation_sites_site_id_fkey',''),
    ('noncredit_self_enrollment_claims','noncredit_self_enrollment_claims_site_id_fkey',' ON DELETE RESTRICT'),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_releases_site_id_fkey',' ON DELETE RESTRICT'),
    ('site_device_registrations','site_device_registrations_site_id_fkey',''),
    ('site_organization_roles','site_organization_roles_site_id_fkey',''),
    ('site_publication_bindings','site_publication_bindings_site_id_fkey','')
 ) AS selected(table_name,constraint_name,delete_suffix)
 LOOP
   SELECT pg_get_constraintdef(c.oid) INTO old_definition
   FROM pg_constraint c
   WHERE c.contype='f' AND c.convalidated
     AND c.conrelid=to_regclass('education_v30.'||item.table_name)
     AND c.confrelid='public.sites'::regclass
     AND c.conname=item.constraint_name;
   IF old_definition IS DISTINCT FROM
    ('FOREIGN KEY (site_id) REFERENCES sites(id)'||item.delete_suffix)
   THEN RAISE EXCEPTION 'Site FK did not rebind: %',item.constraint_name; END IF;
 END LOOP;
END $verify$;
COMMIT;
