-- Consolidation on Neon main: rebind all remaining 29 native Site FKs
-- to the SAME authoritative public.sites(id). No bridge, Site copy or rekey.
-- Existing child table RLS, triggers, grants, and delete behavior unchanged.
-- Not a blanket RLS migration; public.sites read security remains separate.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='85s';

DO $guard$
DECLARE item record; prior text; incompatible bigint; old_site_count bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not Neon CAN OS production main'; END IF;
 IF to_regclass('public.sites') IS NULL OR to_regclass('education_v30.sites') IS NULL
 THEN RAISE EXCEPTION 'Authoritative or legacy Site relation missing'; END IF;
 SELECT count(*) INTO old_site_count FROM education_v30.sites n
   WHERE NOT EXISTS(SELECT 1 FROM public.sites platform WHERE platform.id=n.id);
 IF old_site_count<>0 THEN RAISE EXCEPTION 'Unmatched native Site IDs, refusing rebind'; END IF;
 FOR item IN SELECT * FROM (VALUES
    ('application_principal_grants','application_principal_grants_site_id_fkey','site_id',''),
    ('assurance_cases','assurance_cases_site_id_fkey','site_id',''),
    ('connectivity_services','connectivity_services_site_id_fkey','site_id',''),
    ('control_obligations','control_obligations_site_id_fkey','site_id',''),
    ('equipment_assignments','equipment_assignments_site_id_fkey','site_id',''),
    ('equipment_custody_events','equipment_custody_events_from_site_id_fkey','from_site_id',''),
    ('equipment_custody_events','equipment_custody_events_to_site_id_fkey','to_site_id',''),
    ('evaluation_basis_dependencies','evaluation_basis_dependencies_site_id_fkey','site_id',''),
    ('facilitated_classroom_plans','facilitated_classroom_plans_site_id_fkey','site_id',''),
    ('facilitated_learning_sessions','facilitated_learning_sessions_site_id_fkey','site_id',''),
    ('facilitated_rehearsal_events','facilitated_rehearsal_events_site_id_fkey','site_id',''),
    ('feedback_subjects','feedback_subjects_site_id_fkey','site_id',''),
    ('governance_policy_scopes','governance_policy_scopes_site_id_fkey','site_id',''),
    ('learning_completion_evidence_bindings','learning_completion_evidence_bindings_delivery_site_id_fkey','delivery_site_id',''),
    ('learning_completion_evidence_review_requests','learning_completion_evidence_review_reque_delivery_site_id_fkey','delivery_site_id',''),
    ('metric_observations','metric_observations_site_id_fkey','site_id',''),
    ('official_authorization_scopes','official_authorization_scopes_site_id_fkey','site_id',''),
    ('operational_authorization_decisions','operational_authorization_decisions_site_id_fkey','site_id',''),
    ('operator_rollout_applications','operator_rollout_applications_site_id_fkey','site_id',''),
    ('participation_attributions','participation_attributions_delivery_site_id_fkey','delivery_site_id',' ON DELETE RESTRICT'),
    ('participation_attributions','participation_attributions_reporting_site_id_fkey','reporting_site_id',' ON DELETE RESTRICT'),
    ('qualification_proposed_sites','qualification_proposed_sites_linked_site_id_fkey','linked_site_id',''),
    ('qualification_subjects','qualification_subjects_site_id_fkey','site_id',''),
    ('quality_evaluations','quality_evaluations_subject_site_id_fkey','subject_site_id',''),
    ('shared_resource_pools','shared_resource_pools_site_id_fkey','site_id',''),
    ('site_device_policies','site_device_policies_site_id_fkey','site_id',''),
    ('site_spaces','site_spaces_site_id_fkey','site_id',''),
    ('survey_campaigns','survey_campaigns_site_id_fkey','site_id',''),
    ('technology_readiness_evaluations','technology_readiness_evaluations_site_id_fkey','site_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix)
 LOOP
  SELECT pg_get_constraintdef(c.oid) INTO prior FROM pg_constraint c
   WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable
     AND c.conrelid=to_regclass('education_v30.'||item.table_name)
     AND c.confrelid='education_v30.sites'::regclass
     AND c.conname=item.constraint_name;
  IF prior IS DISTINCT FROM
    ('FOREIGN KEY ('||item.column_name||') REFERENCES education_v30.sites(id)'||item.delete_suffix)
  THEN RAISE EXCEPTION 'Altered native Site FK: %',item.constraint_name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I child LEFT JOIN public.sites platform ON platform.id=child.%I WHERE child.%I IS NOT NULL AND platform.id IS NULL',item.table_name,item.column_name,item.column_name)
    INTO incompatible;
  IF incompatible<>0 THEN RAISE EXCEPTION 'Site UUID not present in shared platform: %',item.table_name; END IF;
 END LOOP;
END $guard$;

DO $migrate$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('application_principal_grants','application_principal_grants_site_id_fkey','site_id',''),
    ('assurance_cases','assurance_cases_site_id_fkey','site_id',''),
    ('connectivity_services','connectivity_services_site_id_fkey','site_id',''),
    ('control_obligations','control_obligations_site_id_fkey','site_id',''),
    ('equipment_assignments','equipment_assignments_site_id_fkey','site_id',''),
    ('equipment_custody_events','equipment_custody_events_from_site_id_fkey','from_site_id',''),
    ('equipment_custody_events','equipment_custody_events_to_site_id_fkey','to_site_id',''),
    ('evaluation_basis_dependencies','evaluation_basis_dependencies_site_id_fkey','site_id',''),
    ('facilitated_classroom_plans','facilitated_classroom_plans_site_id_fkey','site_id',''),
    ('facilitated_learning_sessions','facilitated_learning_sessions_site_id_fkey','site_id',''),
    ('facilitated_rehearsal_events','facilitated_rehearsal_events_site_id_fkey','site_id',''),
    ('feedback_subjects','feedback_subjects_site_id_fkey','site_id',''),
    ('governance_policy_scopes','governance_policy_scopes_site_id_fkey','site_id',''),
    ('learning_completion_evidence_bindings','learning_completion_evidence_bindings_delivery_site_id_fkey','delivery_site_id',''),
    ('learning_completion_evidence_review_requests','learning_completion_evidence_review_reque_delivery_site_id_fkey','delivery_site_id',''),
    ('metric_observations','metric_observations_site_id_fkey','site_id',''),
    ('official_authorization_scopes','official_authorization_scopes_site_id_fkey','site_id',''),
    ('operational_authorization_decisions','operational_authorization_decisions_site_id_fkey','site_id',''),
    ('operator_rollout_applications','operator_rollout_applications_site_id_fkey','site_id',''),
    ('participation_attributions','participation_attributions_delivery_site_id_fkey','delivery_site_id',' ON DELETE RESTRICT'),
    ('participation_attributions','participation_attributions_reporting_site_id_fkey','reporting_site_id',' ON DELETE RESTRICT'),
    ('qualification_proposed_sites','qualification_proposed_sites_linked_site_id_fkey','linked_site_id',''),
    ('qualification_subjects','qualification_subjects_site_id_fkey','site_id',''),
    ('quality_evaluations','quality_evaluations_subject_site_id_fkey','subject_site_id',''),
    ('shared_resource_pools','shared_resource_pools_site_id_fkey','site_id',''),
    ('site_device_policies','site_device_policies_site_id_fkey','site_id',''),
    ('site_spaces','site_spaces_site_id_fkey','site_id',''),
    ('survey_campaigns','survey_campaigns_site_id_fkey','site_id',''),
    ('technology_readiness_evaluations','technology_readiness_evaluations_site_id_fkey','site_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix)
 LOOP
   EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.sites(id)%s',
     item.table_name,item.constraint_name,item.constraint_name,item.column_name,item.delete_suffix);
 END LOOP;
END $migrate$;

DO $verify$
DECLARE item record; after_definition text; remaining integer;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('application_principal_grants','application_principal_grants_site_id_fkey','site_id',''),
    ('assurance_cases','assurance_cases_site_id_fkey','site_id',''),
    ('connectivity_services','connectivity_services_site_id_fkey','site_id',''),
    ('control_obligations','control_obligations_site_id_fkey','site_id',''),
    ('equipment_assignments','equipment_assignments_site_id_fkey','site_id',''),
    ('equipment_custody_events','equipment_custody_events_from_site_id_fkey','from_site_id',''),
    ('equipment_custody_events','equipment_custody_events_to_site_id_fkey','to_site_id',''),
    ('evaluation_basis_dependencies','evaluation_basis_dependencies_site_id_fkey','site_id',''),
    ('facilitated_classroom_plans','facilitated_classroom_plans_site_id_fkey','site_id',''),
    ('facilitated_learning_sessions','facilitated_learning_sessions_site_id_fkey','site_id',''),
    ('facilitated_rehearsal_events','facilitated_rehearsal_events_site_id_fkey','site_id',''),
    ('feedback_subjects','feedback_subjects_site_id_fkey','site_id',''),
    ('governance_policy_scopes','governance_policy_scopes_site_id_fkey','site_id',''),
    ('learning_completion_evidence_bindings','learning_completion_evidence_bindings_delivery_site_id_fkey','delivery_site_id',''),
    ('learning_completion_evidence_review_requests','learning_completion_evidence_review_reque_delivery_site_id_fkey','delivery_site_id',''),
    ('metric_observations','metric_observations_site_id_fkey','site_id',''),
    ('official_authorization_scopes','official_authorization_scopes_site_id_fkey','site_id',''),
    ('operational_authorization_decisions','operational_authorization_decisions_site_id_fkey','site_id',''),
    ('operator_rollout_applications','operator_rollout_applications_site_id_fkey','site_id',''),
    ('participation_attributions','participation_attributions_delivery_site_id_fkey','delivery_site_id',' ON DELETE RESTRICT'),
    ('participation_attributions','participation_attributions_reporting_site_id_fkey','reporting_site_id',' ON DELETE RESTRICT'),
    ('qualification_proposed_sites','qualification_proposed_sites_linked_site_id_fkey','linked_site_id',''),
    ('qualification_subjects','qualification_subjects_site_id_fkey','site_id',''),
    ('quality_evaluations','quality_evaluations_subject_site_id_fkey','subject_site_id',''),
    ('shared_resource_pools','shared_resource_pools_site_id_fkey','site_id',''),
    ('site_device_policies','site_device_policies_site_id_fkey','site_id',''),
    ('site_spaces','site_spaces_site_id_fkey','site_id',''),
    ('survey_campaigns','survey_campaigns_site_id_fkey','site_id',''),
    ('technology_readiness_evaluations','technology_readiness_evaluations_site_id_fkey','site_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix)
 LOOP
   SELECT pg_get_constraintdef(c.oid) INTO after_definition FROM pg_constraint c
   WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable
     AND c.conrelid=to_regclass('education_v30.'||item.table_name)
     AND c.confrelid='public.sites'::regclass
     AND c.conname=item.constraint_name;
   IF after_definition IS DISTINCT FROM
     ('FOREIGN KEY ('||item.column_name||') REFERENCES sites(id)'||item.delete_suffix)
   THEN RAISE EXCEPTION 'Shared Site FK incomplete: %',item.constraint_name; END IF;
 END LOOP;
 SELECT count(*) INTO remaining FROM pg_constraint WHERE contype='f'
   AND confrelid='education_v30.sites'::regclass;
 IF remaining<>0 THEN RAISE EXCEPTION 'Unmigrated native Site FKs: %',remaining; END IF;
END $verify$;
COMMIT;
