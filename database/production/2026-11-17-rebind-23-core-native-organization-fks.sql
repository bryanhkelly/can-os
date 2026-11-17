-- CAN OS main: 23 central Course, Offering, Class, enrollment and
-- institutional role FKs now use public.organizations(id) directly.
-- Includes two populated native Course/Offering records whose UUIDs
-- already match the authoritative public Organization identity.
-- No Organization alias, data copy, RLS changes or permission inference.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='80s';

DO $guard$
DECLARE item record; old_definition text; incompatible bigint; unmatched_native bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Neon main required'; END IF;
 IF to_regclass('public.organizations') IS NULL
  OR to_regclass('education_v30.organizations') IS NULL
 THEN RAISE EXCEPTION 'Organization schema not ready'; END IF;
 SELECT count(*) INTO unmatched_native
 FROM education_v30.organizations n LEFT JOIN public.organizations p ON p.id=n.id
 WHERE p.id IS NULL;
 IF unmatched_native<>0 THEN RAISE EXCEPTION 'Unmatched native Organization: no implicit mapping'; END IF;
 FOR item IN SELECT * FROM (VALUES
    ('assessment_definitions','assessment_definitions_owner_organization_id_fkey','owner_organization_id',''),
    ('blueprints','blueprints_publisher_organization_id_fkey','publisher_organization_id',''),
    ('canonical_account_grants','canonical_account_grants_organization_id_fkey','organization_id',''),
    ('class_enrollment_approval_requests','class_enrollment_approval_reques_operating_organization_id_fkey','operating_organization_id',''),
    ('class_enrollment_invitations','class_enrollment_invitations_operating_organization_id_fkey','operating_organization_id',''),
    ('classes','classes_operating_organization_id_fkey','operating_organization_id',''),
    ('courses','courses_publisher_organization_id_fkey','publisher_organization_id',''),
    ('credential_issuances','credential_issuances_issuing_organization_id_fkey','issuing_organization_id',''),
    ('education_networks','education_networks_steward_organization_id_fkey','steward_organization_id',''),
    ('education_operation_organization_roles','education_operation_organization_roles_organization_id_fkey','organization_id',''),
    ('instructional_tracks','instructional_tracks_producer_organization_id_fkey','producer_organization_id',''),
    ('network_memberships','network_memberships_organization_id_fkey','organization_id',''),
    ('network_reporting_grants','network_reporting_grants_host_organization_id_fkey','host_organization_id',' ON DELETE RESTRICT'),
    ('network_reporting_grants','network_reporting_grants_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('network_reporting_memberships','network_reporting_memberships_member_organization_id_fkey','member_organization_id',' ON DELETE RESTRICT'),
    ('network_reporting_memberships','network_reporting_memberships_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_registrations','noncredit_registrations_registering_organization_id_fkey','registering_organization_id',''),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_rele_registering_organization_id_fkey','registering_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_release_provider_organization_id_fkey','provider_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_training_versions','noncredit_training_versions_provider_organization_id_fkey','provider_organization_id',''),
    ('offerings','offerings_publisher_organization_id_fkey','publisher_organization_id',''),
    ('participation_attributions','participation_attributions_credited_organization_id_fkey','credited_organization_id',' ON DELETE RESTRICT'),
    ('site_organization_roles','site_organization_roles_organization_id_fkey','organization_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix) LOOP
  SELECT pg_get_constraintdef(c.oid) INTO old_definition FROM pg_constraint c
  WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable
    AND c.conrelid=to_regclass('education_v30.'||item.table_name)
    AND c.confrelid='education_v30.organizations'::regclass
    AND c.conname=item.constraint_name;
  IF old_definition IS DISTINCT FROM
    ('FOREIGN KEY ('||item.column_name||') REFERENCES education_v30.organizations(id)'||item.delete_suffix)
  THEN RAISE EXCEPTION 'Foreign key changed: %',item.constraint_name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I child LEFT JOIN public.organizations parent ON parent.id=child.%I WHERE child.%I IS NOT NULL AND parent.id IS NULL',
    item.table_name,item.column_name,item.column_name) INTO incompatible;
  IF incompatible<>0 THEN RAISE EXCEPTION 'Unmapped Organization in %',item.table_name; END IF;
 END LOOP;
END $guard$;

DO $migrate$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('assessment_definitions','assessment_definitions_owner_organization_id_fkey','owner_organization_id',''),
    ('blueprints','blueprints_publisher_organization_id_fkey','publisher_organization_id',''),
    ('canonical_account_grants','canonical_account_grants_organization_id_fkey','organization_id',''),
    ('class_enrollment_approval_requests','class_enrollment_approval_reques_operating_organization_id_fkey','operating_organization_id',''),
    ('class_enrollment_invitations','class_enrollment_invitations_operating_organization_id_fkey','operating_organization_id',''),
    ('classes','classes_operating_organization_id_fkey','operating_organization_id',''),
    ('courses','courses_publisher_organization_id_fkey','publisher_organization_id',''),
    ('credential_issuances','credential_issuances_issuing_organization_id_fkey','issuing_organization_id',''),
    ('education_networks','education_networks_steward_organization_id_fkey','steward_organization_id',''),
    ('education_operation_organization_roles','education_operation_organization_roles_organization_id_fkey','organization_id',''),
    ('instructional_tracks','instructional_tracks_producer_organization_id_fkey','producer_organization_id',''),
    ('network_memberships','network_memberships_organization_id_fkey','organization_id',''),
    ('network_reporting_grants','network_reporting_grants_host_organization_id_fkey','host_organization_id',' ON DELETE RESTRICT'),
    ('network_reporting_grants','network_reporting_grants_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('network_reporting_memberships','network_reporting_memberships_member_organization_id_fkey','member_organization_id',' ON DELETE RESTRICT'),
    ('network_reporting_memberships','network_reporting_memberships_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_registrations','noncredit_registrations_registering_organization_id_fkey','registering_organization_id',''),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_rele_registering_organization_id_fkey','registering_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_release_provider_organization_id_fkey','provider_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_training_versions','noncredit_training_versions_provider_organization_id_fkey','provider_organization_id',''),
    ('offerings','offerings_publisher_organization_id_fkey','publisher_organization_id',''),
    ('participation_attributions','participation_attributions_credited_organization_id_fkey','credited_organization_id',' ON DELETE RESTRICT'),
    ('site_organization_roles','site_organization_roles_organization_id_fkey','organization_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix) LOOP
  EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.organizations(id)%s',
    item.table_name,item.constraint_name,item.constraint_name,item.column_name,item.delete_suffix);
 END LOOP;
END $migrate$;

DO $verify$
DECLARE item record; definition text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('assessment_definitions','assessment_definitions_owner_organization_id_fkey','owner_organization_id',''),
    ('blueprints','blueprints_publisher_organization_id_fkey','publisher_organization_id',''),
    ('canonical_account_grants','canonical_account_grants_organization_id_fkey','organization_id',''),
    ('class_enrollment_approval_requests','class_enrollment_approval_reques_operating_organization_id_fkey','operating_organization_id',''),
    ('class_enrollment_invitations','class_enrollment_invitations_operating_organization_id_fkey','operating_organization_id',''),
    ('classes','classes_operating_organization_id_fkey','operating_organization_id',''),
    ('courses','courses_publisher_organization_id_fkey','publisher_organization_id',''),
    ('credential_issuances','credential_issuances_issuing_organization_id_fkey','issuing_organization_id',''),
    ('education_networks','education_networks_steward_organization_id_fkey','steward_organization_id',''),
    ('education_operation_organization_roles','education_operation_organization_roles_organization_id_fkey','organization_id',''),
    ('instructional_tracks','instructional_tracks_producer_organization_id_fkey','producer_organization_id',''),
    ('network_memberships','network_memberships_organization_id_fkey','organization_id',''),
    ('network_reporting_grants','network_reporting_grants_host_organization_id_fkey','host_organization_id',' ON DELETE RESTRICT'),
    ('network_reporting_grants','network_reporting_grants_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('network_reporting_memberships','network_reporting_memberships_member_organization_id_fkey','member_organization_id',' ON DELETE RESTRICT'),
    ('network_reporting_memberships','network_reporting_memberships_network_organization_id_fkey','network_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_registrations','noncredit_registrations_registering_organization_id_fkey','registering_organization_id',''),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_rele_registering_organization_id_fkey','registering_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_self_enrollment_releases','noncredit_self_enrollment_release_provider_organization_id_fkey','provider_organization_id',' ON DELETE RESTRICT'),
    ('noncredit_training_versions','noncredit_training_versions_provider_organization_id_fkey','provider_organization_id',''),
    ('offerings','offerings_publisher_organization_id_fkey','publisher_organization_id',''),
    ('participation_attributions','participation_attributions_credited_organization_id_fkey','credited_organization_id',' ON DELETE RESTRICT'),
    ('site_organization_roles','site_organization_roles_organization_id_fkey','organization_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix) LOOP
  SELECT pg_get_constraintdef(c.oid) INTO definition FROM pg_constraint c
  WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable
    AND c.conrelid=to_regclass('education_v30.'||item.table_name)
    AND c.confrelid='public.organizations'::regclass
    AND c.conname=item.constraint_name;
  IF definition IS DISTINCT FROM
    ('FOREIGN KEY ('||item.column_name||') REFERENCES organizations(id)'||item.delete_suffix)
  THEN RAISE EXCEPTION 'Foreign key did not migrate: %',item.constraint_name; END IF;
 END LOOP;
END $verify$;
COMMIT;
