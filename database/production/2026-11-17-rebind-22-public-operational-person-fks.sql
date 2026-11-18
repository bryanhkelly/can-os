-- CAN OS Neon main: move all 22 operational public-schema Person FKs
-- directly to public.people. The three historical account-correspondence
-- /adult-review relationships are deliberately excluded for identity review.
-- No bridge, Person copy, inferred match or grant change.
-- Child table permissions, RLS, constraint names and referential behavior stay.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$
DECLARE item record; definition text; rows_before bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb'
 THEN RAISE EXCEPTION 'Refusing any database other than CAN OS Neon main'; END IF;
 IF to_regclass('public.people') IS NULL OR
 to_regclass('education_v30.persons') IS NULL OR
 (SELECT count(*) FROM education_v30.persons)<>0
 THEN RAISE EXCEPTION 'Person identity source changed'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE contype='f'
   AND confrelid='education_v30.persons'::regclass)<>63
 THEN RAISE EXCEPTION 'Unreviewed native Person FK graph changed'; END IF;
 FOR item IN SELECT * FROM (VALUES
    ('application_principal_grants','application_principal_grants_granted_by_person_id_fkey','granted_by_person_id'),
    ('application_principals','application_principals_person_id_fkey','person_id'),
    ('assurance_case_assignments','assurance_case_assignments_assigned_by_person_id_fkey','assigned_by_person_id'),
    ('assurance_case_assignments','assurance_case_assignments_responsible_person_id_fkey','responsible_person_id'),
    ('connectivity_services','connectivity_services_participant_person_id_fkey','participant_person_id'),
    ('enrollment_prospects','enrollment_prospects_contact_person_id_fkey','contact_person_id'),
    ('governance_exceptions','governance_exceptions_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('guardian_authorities','guardian_authorities_guardian_person_id_fkey','guardian_person_id'),
    ('improvement_action_evidence','improvement_action_evidence_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('initiative_metric_definition_versions','initiative_metric_definition_versio_published_by_person_id_fkey','published_by_person_id'),
    ('network_aggregate_reports','network_aggregate_reports_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('professional_contributions','professional_contributions_contributor_person_id_fkey','contributor_person_id'),
    ('professional_profiles','professional_profiles_person_id_fkey','person_id'),
    ('professional_qualifications','professional_qualifications_person_id_fkey','person_id'),
    ('professional_qualifications','professional_qualifications_verified_by_person_id_fkey','verified_by_person_id'),
    ('professional_service_engagements','professional_service_engagements_provider_person_id_fkey','provider_person_id'),
    ('professional_service_requests','professional_service_requests_requester_person_id_fkey','requester_person_id'),
    ('qualification_assurance_case_links','qualification_assurance_case_links_linked_by_person_id_fkey','linked_by_person_id'),
    ('qualification_evidence_requests','qualification_evidence_requests_requested_by_person_id_fkey','requested_by_person_id'),
    ('qualification_reassessment_requests','qualification_reassessment_requests_requested_by_person_id_fkey','requested_by_person_id'),
    ('staff_assignments','staff_assignments_person_id_fkey','person_id'),
    ('technology_access_interventions','technology_access_interventions_verified_by_person_id_fkey','verified_by_person_id')
) AS selected(table_name,constraint_name,column_name) LOOP
  SELECT pg_get_constraintdef(c.oid) INTO definition FROM pg_constraint c
  WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable
   AND c.conrelid=to_regclass('public.'||item.table_name)
   AND c.confrelid='education_v30.persons'::regclass
   AND c.conname=item.constraint_name;
  IF definition IS DISTINCT FROM
   ('FOREIGN KEY ('||item.column_name||') REFERENCES education_v30.persons(id)')
  THEN RAISE EXCEPTION 'Operational Person FK changed: %',item.constraint_name; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',item.table_name) INTO rows_before;
  IF rows_before<>0 THEN RAISE EXCEPTION 'Operational Person records need review: %',item.table_name; END IF;
 END LOOP;
END $guard$;
DO $migrate$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('application_principal_grants','application_principal_grants_granted_by_person_id_fkey','granted_by_person_id'),
    ('application_principals','application_principals_person_id_fkey','person_id'),
    ('assurance_case_assignments','assurance_case_assignments_assigned_by_person_id_fkey','assigned_by_person_id'),
    ('assurance_case_assignments','assurance_case_assignments_responsible_person_id_fkey','responsible_person_id'),
    ('connectivity_services','connectivity_services_participant_person_id_fkey','participant_person_id'),
    ('enrollment_prospects','enrollment_prospects_contact_person_id_fkey','contact_person_id'),
    ('governance_exceptions','governance_exceptions_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('guardian_authorities','guardian_authorities_guardian_person_id_fkey','guardian_person_id'),
    ('improvement_action_evidence','improvement_action_evidence_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('initiative_metric_definition_versions','initiative_metric_definition_versio_published_by_person_id_fkey','published_by_person_id'),
    ('network_aggregate_reports','network_aggregate_reports_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('professional_contributions','professional_contributions_contributor_person_id_fkey','contributor_person_id'),
    ('professional_profiles','professional_profiles_person_id_fkey','person_id'),
    ('professional_qualifications','professional_qualifications_person_id_fkey','person_id'),
    ('professional_qualifications','professional_qualifications_verified_by_person_id_fkey','verified_by_person_id'),
    ('professional_service_engagements','professional_service_engagements_provider_person_id_fkey','provider_person_id'),
    ('professional_service_requests','professional_service_requests_requester_person_id_fkey','requester_person_id'),
    ('qualification_assurance_case_links','qualification_assurance_case_links_linked_by_person_id_fkey','linked_by_person_id'),
    ('qualification_evidence_requests','qualification_evidence_requests_requested_by_person_id_fkey','requested_by_person_id'),
    ('qualification_reassessment_requests','qualification_reassessment_requests_requested_by_person_id_fkey','requested_by_person_id'),
    ('staff_assignments','staff_assignments_person_id_fkey','person_id'),
    ('technology_access_interventions','technology_access_interventions_verified_by_person_id_fkey','verified_by_person_id')
) AS selected(table_name,constraint_name,column_name) LOOP
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)',
    item.table_name,item.constraint_name,item.constraint_name,item.column_name);
 END LOOP;
END $migrate$;
DO $verify$
DECLARE item record; remaining integer;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('application_principal_grants','application_principal_grants_granted_by_person_id_fkey','granted_by_person_id'),
    ('application_principals','application_principals_person_id_fkey','person_id'),
    ('assurance_case_assignments','assurance_case_assignments_assigned_by_person_id_fkey','assigned_by_person_id'),
    ('assurance_case_assignments','assurance_case_assignments_responsible_person_id_fkey','responsible_person_id'),
    ('connectivity_services','connectivity_services_participant_person_id_fkey','participant_person_id'),
    ('enrollment_prospects','enrollment_prospects_contact_person_id_fkey','contact_person_id'),
    ('governance_exceptions','governance_exceptions_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('guardian_authorities','guardian_authorities_guardian_person_id_fkey','guardian_person_id'),
    ('improvement_action_evidence','improvement_action_evidence_submitted_by_person_id_fkey','submitted_by_person_id'),
    ('initiative_metric_definition_versions','initiative_metric_definition_versio_published_by_person_id_fkey','published_by_person_id'),
    ('network_aggregate_reports','network_aggregate_reports_authorized_by_person_id_fkey','authorized_by_person_id'),
    ('professional_contributions','professional_contributions_contributor_person_id_fkey','contributor_person_id'),
    ('professional_profiles','professional_profiles_person_id_fkey','person_id'),
    ('professional_qualifications','professional_qualifications_person_id_fkey','person_id'),
    ('professional_qualifications','professional_qualifications_verified_by_person_id_fkey','verified_by_person_id'),
    ('professional_service_engagements','professional_service_engagements_provider_person_id_fkey','provider_person_id'),
    ('professional_service_requests','professional_service_requests_requester_person_id_fkey','requester_person_id'),
    ('qualification_assurance_case_links','qualification_assurance_case_links_linked_by_person_id_fkey','linked_by_person_id'),
    ('qualification_evidence_requests','qualification_evidence_requests_requested_by_person_id_fkey','requested_by_person_id'),
    ('qualification_reassessment_requests','qualification_reassessment_requests_requested_by_person_id_fkey','requested_by_person_id'),
    ('staff_assignments','staff_assignments_person_id_fkey','person_id'),
    ('technology_access_interventions','technology_access_interventions_verified_by_person_id_fkey','verified_by_person_id')
) AS selected(table_name,constraint_name,column_name) LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.contype='f'
     AND c.convalidated AND NOT c.condeferrable
     AND c.conrelid=to_regclass('public.'||item.table_name)
     AND c.confrelid='public.people'::regclass
     AND c.conname=item.constraint_name
     AND pg_get_constraintdef(c.oid)=
         ('FOREIGN KEY ('||item.column_name||') REFERENCES people(id)'))
  THEN RAISE EXCEPTION 'Public Person FK did not rebind: %',item.constraint_name; END IF;
 END LOOP;
 SELECT count(*) INTO remaining FROM pg_constraint c
 JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
 WHERE c.contype='f' AND ns.nspname='public'
 AND c.confrelid='education_v30.persons'::regclass;
 IF remaining<>3 THEN RAISE EXCEPTION 'Unreviewed public Person references remain: %',remaining; END IF;
END $verify$;
COMMIT;
