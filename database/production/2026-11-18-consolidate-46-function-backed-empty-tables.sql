-- CAN OS | coordinated 46-table main-only schema consolidation
-- All 46 sources are empty, no conflicting public table or index, no source
-- code runtime references found, no matching views or explicitly qualified
-- SQL-function references. Preserve OIDs, indexes, triggers, constraints,
-- RLS/FORCE, permissions, and dependent FKs. NO DROP / COPY / BRIDGE.
-- Rebind 34 existing education_v30 routines by appending trusted public
-- to their fixed search_path; education_v30 and pg_catalog retain precedence.
-- Atomic DO statement: any validation error rolls back entire batch.
DO $batch$
DECLARE
  v record;
  fn record;
  source_oid oid;
  row_count bigint;
  fcount integer;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('statement_timeout','90s',true);
  IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
  THEN RAISE EXCEPTION 'Neon CAN OS main is required'; END IF;
  IF has_schema_privilege('authenticated','public','CREATE')
  THEN RAISE EXCEPTION 'Refusing definer search-path fallback to writable public'; END IF;

  FOR v IN SELECT * FROM (VALUES
    ('academic_credit_awards',407196,true,true,1,2,6,2,10),
    ('academic_framework_review_decisions',409703,true,true,1,1,4,0,6),
    ('academic_framework_version_competencies',406337,false,false,0,2,3,0,4),
    ('application_decisions',413448,true,true,1,2,5,2,6),
    ('assessment_item_assets',406174,false,false,0,1,2,0,2),
    ('assessment_review_events',407107,true,true,1,1,3,0,4),
    ('assessment_scoring_assignments',406920,true,true,1,1,4,2,7),
    ('assurance_control_versions',411344,true,true,1,1,3,2,4),
    ('blueprint_component_dependencies',403098,false,false,0,1,2,0,3),
    ('competency_prerequisites',409670,false,false,0,1,3,0,4),
    ('competency_version_withdrawals',406311,false,false,0,1,2,0,3),
    ('contractual_milestones',408860,false,false,0,0,3,2,5),
    ('control_evaluations',411422,true,true,1,1,4,6,5),
    ('creator_commissions',404194,false,false,0,0,5,1,7),
    ('credential_issuance_support',413313,true,true,1,2,8,0,9),
    ('deployment_readiness_evidence_checks',416449,true,true,1,1,3,0,4),
    ('education_service_evidence',408771,true,true,1,0,6,1,8),
    ('evaluation_basis_dependencies',418784,true,true,1,1,8,1,1),
    ('experience_metrics',412981,false,false,0,0,1,1,3),
    ('foundation_activities',409920,false,false,0,2,2,2,5),
    ('foundation_release_review_decisions',410054,true,true,1,1,5,0,7),
    ('foundation_resource_bindings',409957,false,false,0,1,4,0,5),
    ('funding_claim_lines',409001,true,true,1,2,2,0,3),
    ('funding_cost_categories',415647,false,false,0,0,0,3,1),
    ('grading_assignments',405892,true,true,1,1,7,2,10),
    ('improvement_verifications',413244,true,true,1,2,3,0,4),
    ('initiative_impact_snapshots',414553,true,true,1,1,4,1,5),
    ('instructor_supplement_reviews',404537,false,false,0,1,3,0,5),
    ('learner_benefit_entitlements',408725,true,true,1,0,4,2,6),
    ('official_authorization_events',408425,false,false,0,1,3,0,4),
    ('production_deliverables',404238,false,false,0,1,3,3,5),
    ('qualification_answer_guidance_rules',418042,true,true,1,1,3,0,3),
    ('qualification_conditions',417652,true,true,1,2,3,0,4),
    ('qualification_evaluation_answers',417507,true,true,1,2,4,0,5),
    ('qualification_evaluation_control_verifications',417556,true,true,1,1,2,0,2),
    ('qualification_evaluation_facility_verifications',417539,true,true,1,1,2,0,2),
    ('qualification_evidence_access_grants',417154,true,true,1,1,5,0,6),
    ('qualification_evidence_types',416768,true,true,1,1,0,1,1),
    ('qualification_network_reporting_grants',418880,true,true,1,1,6,0,3),
    ('qualification_operational_gates',417762,true,true,1,1,6,0,7),
    ('qualification_person_consents',416860,true,true,1,1,3,1,4),
    ('qualification_template_reviews',416597,true,true,1,1,3,0,5),
    ('readiness_evaluation_requirements',410762,true,true,1,1,2,1,5),
    ('readiness_requirement_evidence',410791,true,true,1,1,4,0,5),
    ('workforce_compensation_agreements',409145,true,true,1,0,4,1,5),
    ('workforce_compensation_terms',409182,true,true,1,0,3,3,6)
) snapshot(name,source_oid,rls,force_rls,policy_count,trigger_count,outbound_fks,inbound_fks,index_count) LOOP
    source_oid:=to_regclass(format('education_v30.%I',v.name));
    IF source_oid IS DISTINCT FROM v.source_oid::oid
       OR to_regclass(format('public.%I',v.name)) IS NOT NULL
       OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=source_oid
         AND c.relkind='r' AND c.relrowsecurity=v.rls
         AND c.relforcerowsecurity=v.force_rls AND c.relacl IS NULL)
       OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=source_oid)<>v.policy_count
       OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=source_oid AND NOT t.tgisinternal)<>v.trigger_count
       OR (SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.conrelid=source_oid)<>v.outbound_fks
       OR (SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.confrelid=source_oid)<>v.inbound_fks
       OR (SELECT count(*) FROM pg_index i WHERE i.indrelid=source_oid)<>v.index_count
       OR EXISTS (SELECT 1 FROM pg_views w WHERE w.definition ILIKE '%'||v.name||'%')
       OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%education_v30.'||v.name||'%')
       OR EXISTS (SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
          WHERE i.indrelid=source_oid AND EXISTS(SELECT 1 FROM pg_class p
          WHERE p.relnamespace='public'::regnamespace AND p.relname=idx.relname))
       OR has_table_privilege('authenticated',source_oid,'SELECT')
       OR has_table_privilege('authenticated',source_oid,'INSERT')
       OR has_table_privilege('authenticated',source_oid,'UPDATE')
       OR has_table_privilege('authenticated',source_oid,'DELETE')
    THEN RAISE EXCEPTION 'Table preflight failed: %',v.name; END IF;
    EXECUTE format('SELECT count(*) FROM education_v30.%I',v.name) INTO row_count;
    IF row_count<>0 THEN RAISE EXCEPTION 'Nonempty legacy table: % (% rows)',v.name,row_count; END IF;
  END LOOP;

  SELECT count(DISTINCT p.oid) INTO fcount FROM pg_proc p
  JOIN (SELECT * FROM (VALUES
    ('academic_credit_awards',407196,true,true,1,2,6,2,10),
    ('academic_framework_review_decisions',409703,true,true,1,1,4,0,6),
    ('academic_framework_version_competencies',406337,false,false,0,2,3,0,4),
    ('application_decisions',413448,true,true,1,2,5,2,6),
    ('assessment_item_assets',406174,false,false,0,1,2,0,2),
    ('assessment_review_events',407107,true,true,1,1,3,0,4),
    ('assessment_scoring_assignments',406920,true,true,1,1,4,2,7),
    ('assurance_control_versions',411344,true,true,1,1,3,2,4),
    ('blueprint_component_dependencies',403098,false,false,0,1,2,0,3),
    ('competency_prerequisites',409670,false,false,0,1,3,0,4),
    ('competency_version_withdrawals',406311,false,false,0,1,2,0,3),
    ('contractual_milestones',408860,false,false,0,0,3,2,5),
    ('control_evaluations',411422,true,true,1,1,4,6,5),
    ('creator_commissions',404194,false,false,0,0,5,1,7),
    ('credential_issuance_support',413313,true,true,1,2,8,0,9),
    ('deployment_readiness_evidence_checks',416449,true,true,1,1,3,0,4),
    ('education_service_evidence',408771,true,true,1,0,6,1,8),
    ('evaluation_basis_dependencies',418784,true,true,1,1,8,1,1),
    ('experience_metrics',412981,false,false,0,0,1,1,3),
    ('foundation_activities',409920,false,false,0,2,2,2,5),
    ('foundation_release_review_decisions',410054,true,true,1,1,5,0,7),
    ('foundation_resource_bindings',409957,false,false,0,1,4,0,5),
    ('funding_claim_lines',409001,true,true,1,2,2,0,3),
    ('funding_cost_categories',415647,false,false,0,0,0,3,1),
    ('grading_assignments',405892,true,true,1,1,7,2,10),
    ('improvement_verifications',413244,true,true,1,2,3,0,4),
    ('initiative_impact_snapshots',414553,true,true,1,1,4,1,5),
    ('instructor_supplement_reviews',404537,false,false,0,1,3,0,5),
    ('learner_benefit_entitlements',408725,true,true,1,0,4,2,6),
    ('official_authorization_events',408425,false,false,0,1,3,0,4),
    ('production_deliverables',404238,false,false,0,1,3,3,5),
    ('qualification_answer_guidance_rules',418042,true,true,1,1,3,0,3),
    ('qualification_conditions',417652,true,true,1,2,3,0,4),
    ('qualification_evaluation_answers',417507,true,true,1,2,4,0,5),
    ('qualification_evaluation_control_verifications',417556,true,true,1,1,2,0,2),
    ('qualification_evaluation_facility_verifications',417539,true,true,1,1,2,0,2),
    ('qualification_evidence_access_grants',417154,true,true,1,1,5,0,6),
    ('qualification_evidence_types',416768,true,true,1,1,0,1,1),
    ('qualification_network_reporting_grants',418880,true,true,1,1,6,0,3),
    ('qualification_operational_gates',417762,true,true,1,1,6,0,7),
    ('qualification_person_consents',416860,true,true,1,1,3,1,4),
    ('qualification_template_reviews',416597,true,true,1,1,3,0,5),
    ('readiness_evaluation_requirements',410762,true,true,1,1,2,1,5),
    ('readiness_requirement_evidence',410791,true,true,1,1,4,0,5),
    ('workforce_compensation_agreements',409145,true,true,1,0,4,1,5),
    ('workforce_compensation_terms',409182,true,true,1,0,3,3,6)
) snapshot(name,source_oid,rls,force_rls,policy_count,trigger_count,outbound_fks,inbound_fks,index_count)) v ON p.prosrc ILIKE '%'||v.name||'%';
  IF fcount<>34 THEN RAISE EXCEPTION 'Expected 34 referencing routines, found %',fcount; END IF;
  FOR fn IN
    SELECT DISTINCT p.oid,p.oid::regprocedure AS proc_id,p.proconfig,ns.nspname AS fn_schema,
      pg_get_userbyid(p.proowner) AS function_owner
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    JOIN (SELECT * FROM (VALUES
    ('academic_credit_awards',407196,true,true,1,2,6,2,10),
    ('academic_framework_review_decisions',409703,true,true,1,1,4,0,6),
    ('academic_framework_version_competencies',406337,false,false,0,2,3,0,4),
    ('application_decisions',413448,true,true,1,2,5,2,6),
    ('assessment_item_assets',406174,false,false,0,1,2,0,2),
    ('assessment_review_events',407107,true,true,1,1,3,0,4),
    ('assessment_scoring_assignments',406920,true,true,1,1,4,2,7),
    ('assurance_control_versions',411344,true,true,1,1,3,2,4),
    ('blueprint_component_dependencies',403098,false,false,0,1,2,0,3),
    ('competency_prerequisites',409670,false,false,0,1,3,0,4),
    ('competency_version_withdrawals',406311,false,false,0,1,2,0,3),
    ('contractual_milestones',408860,false,false,0,0,3,2,5),
    ('control_evaluations',411422,true,true,1,1,4,6,5),
    ('creator_commissions',404194,false,false,0,0,5,1,7),
    ('credential_issuance_support',413313,true,true,1,2,8,0,9),
    ('deployment_readiness_evidence_checks',416449,true,true,1,1,3,0,4),
    ('education_service_evidence',408771,true,true,1,0,6,1,8),
    ('evaluation_basis_dependencies',418784,true,true,1,1,8,1,1),
    ('experience_metrics',412981,false,false,0,0,1,1,3),
    ('foundation_activities',409920,false,false,0,2,2,2,5),
    ('foundation_release_review_decisions',410054,true,true,1,1,5,0,7),
    ('foundation_resource_bindings',409957,false,false,0,1,4,0,5),
    ('funding_claim_lines',409001,true,true,1,2,2,0,3),
    ('funding_cost_categories',415647,false,false,0,0,0,3,1),
    ('grading_assignments',405892,true,true,1,1,7,2,10),
    ('improvement_verifications',413244,true,true,1,2,3,0,4),
    ('initiative_impact_snapshots',414553,true,true,1,1,4,1,5),
    ('instructor_supplement_reviews',404537,false,false,0,1,3,0,5),
    ('learner_benefit_entitlements',408725,true,true,1,0,4,2,6),
    ('official_authorization_events',408425,false,false,0,1,3,0,4),
    ('production_deliverables',404238,false,false,0,1,3,3,5),
    ('qualification_answer_guidance_rules',418042,true,true,1,1,3,0,3),
    ('qualification_conditions',417652,true,true,1,2,3,0,4),
    ('qualification_evaluation_answers',417507,true,true,1,2,4,0,5),
    ('qualification_evaluation_control_verifications',417556,true,true,1,1,2,0,2),
    ('qualification_evaluation_facility_verifications',417539,true,true,1,1,2,0,2),
    ('qualification_evidence_access_grants',417154,true,true,1,1,5,0,6),
    ('qualification_evidence_types',416768,true,true,1,1,0,1,1),
    ('qualification_network_reporting_grants',418880,true,true,1,1,6,0,3),
    ('qualification_operational_gates',417762,true,true,1,1,6,0,7),
    ('qualification_person_consents',416860,true,true,1,1,3,1,4),
    ('qualification_template_reviews',416597,true,true,1,1,3,0,5),
    ('readiness_evaluation_requirements',410762,true,true,1,1,2,1,5),
    ('readiness_requirement_evidence',410791,true,true,1,1,4,0,5),
    ('workforce_compensation_agreements',409145,true,true,1,0,4,1,5),
    ('workforce_compensation_terms',409182,true,true,1,0,3,3,6)
) snapshot(name,source_oid,rls,force_rls,policy_count,trigger_count,outbound_fks,inbound_fks,index_count)) v ON p.prosrc ILIKE '%'||v.name||'%'
  LOOP
    IF fn.fn_schema<>'education_v30' OR fn.function_owner<>'neondb_owner'
      OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
    THEN RAISE EXCEPTION 'Routine search path or ownership drifted: %',fn.proc_id; END IF;
  END LOOP;

  FOR v IN SELECT * FROM (VALUES
    ('academic_credit_awards',407196,true,true,1,2,6,2,10),
    ('academic_framework_review_decisions',409703,true,true,1,1,4,0,6),
    ('academic_framework_version_competencies',406337,false,false,0,2,3,0,4),
    ('application_decisions',413448,true,true,1,2,5,2,6),
    ('assessment_item_assets',406174,false,false,0,1,2,0,2),
    ('assessment_review_events',407107,true,true,1,1,3,0,4),
    ('assessment_scoring_assignments',406920,true,true,1,1,4,2,7),
    ('assurance_control_versions',411344,true,true,1,1,3,2,4),
    ('blueprint_component_dependencies',403098,false,false,0,1,2,0,3),
    ('competency_prerequisites',409670,false,false,0,1,3,0,4),
    ('competency_version_withdrawals',406311,false,false,0,1,2,0,3),
    ('contractual_milestones',408860,false,false,0,0,3,2,5),
    ('control_evaluations',411422,true,true,1,1,4,6,5),
    ('creator_commissions',404194,false,false,0,0,5,1,7),
    ('credential_issuance_support',413313,true,true,1,2,8,0,9),
    ('deployment_readiness_evidence_checks',416449,true,true,1,1,3,0,4),
    ('education_service_evidence',408771,true,true,1,0,6,1,8),
    ('evaluation_basis_dependencies',418784,true,true,1,1,8,1,1),
    ('experience_metrics',412981,false,false,0,0,1,1,3),
    ('foundation_activities',409920,false,false,0,2,2,2,5),
    ('foundation_release_review_decisions',410054,true,true,1,1,5,0,7),
    ('foundation_resource_bindings',409957,false,false,0,1,4,0,5),
    ('funding_claim_lines',409001,true,true,1,2,2,0,3),
    ('funding_cost_categories',415647,false,false,0,0,0,3,1),
    ('grading_assignments',405892,true,true,1,1,7,2,10),
    ('improvement_verifications',413244,true,true,1,2,3,0,4),
    ('initiative_impact_snapshots',414553,true,true,1,1,4,1,5),
    ('instructor_supplement_reviews',404537,false,false,0,1,3,0,5),
    ('learner_benefit_entitlements',408725,true,true,1,0,4,2,6),
    ('official_authorization_events',408425,false,false,0,1,3,0,4),
    ('production_deliverables',404238,false,false,0,1,3,3,5),
    ('qualification_answer_guidance_rules',418042,true,true,1,1,3,0,3),
    ('qualification_conditions',417652,true,true,1,2,3,0,4),
    ('qualification_evaluation_answers',417507,true,true,1,2,4,0,5),
    ('qualification_evaluation_control_verifications',417556,true,true,1,1,2,0,2),
    ('qualification_evaluation_facility_verifications',417539,true,true,1,1,2,0,2),
    ('qualification_evidence_access_grants',417154,true,true,1,1,5,0,6),
    ('qualification_evidence_types',416768,true,true,1,1,0,1,1),
    ('qualification_network_reporting_grants',418880,true,true,1,1,6,0,3),
    ('qualification_operational_gates',417762,true,true,1,1,6,0,7),
    ('qualification_person_consents',416860,true,true,1,1,3,1,4),
    ('qualification_template_reviews',416597,true,true,1,1,3,0,5),
    ('readiness_evaluation_requirements',410762,true,true,1,1,2,1,5),
    ('readiness_requirement_evidence',410791,true,true,1,1,4,0,5),
    ('workforce_compensation_agreements',409145,true,true,1,0,4,1,5),
    ('workforce_compensation_terms',409182,true,true,1,0,3,3,6)
) snapshot(name,source_oid,rls,force_rls,policy_count,trigger_count,outbound_fks,inbound_fks,index_count) LOOP
    EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',v.name);
  END LOOP;
  FOR fn IN
    SELECT DISTINCT p.oid,p.oid::regprocedure AS proc_id
    FROM pg_proc p JOIN (SELECT * FROM (VALUES
    ('academic_credit_awards',407196,true,true,1,2,6,2,10),
    ('academic_framework_review_decisions',409703,true,true,1,1,4,0,6),
    ('academic_framework_version_competencies',406337,false,false,0,2,3,0,4),
    ('application_decisions',413448,true,true,1,2,5,2,6),
    ('assessment_item_assets',406174,false,false,0,1,2,0,2),
    ('assessment_review_events',407107,true,true,1,1,3,0,4),
    ('assessment_scoring_assignments',406920,true,true,1,1,4,2,7),
    ('assurance_control_versions',411344,true,true,1,1,3,2,4),
    ('blueprint_component_dependencies',403098,false,false,0,1,2,0,3),
    ('competency_prerequisites',409670,false,false,0,1,3,0,4),
    ('competency_version_withdrawals',406311,false,false,0,1,2,0,3),
    ('contractual_milestones',408860,false,false,0,0,3,2,5),
    ('control_evaluations',411422,true,true,1,1,4,6,5),
    ('creator_commissions',404194,false,false,0,0,5,1,7),
    ('credential_issuance_support',413313,true,true,1,2,8,0,9),
    ('deployment_readiness_evidence_checks',416449,true,true,1,1,3,0,4),
    ('education_service_evidence',408771,true,true,1,0,6,1,8),
    ('evaluation_basis_dependencies',418784,true,true,1,1,8,1,1),
    ('experience_metrics',412981,false,false,0,0,1,1,3),
    ('foundation_activities',409920,false,false,0,2,2,2,5),
    ('foundation_release_review_decisions',410054,true,true,1,1,5,0,7),
    ('foundation_resource_bindings',409957,false,false,0,1,4,0,5),
    ('funding_claim_lines',409001,true,true,1,2,2,0,3),
    ('funding_cost_categories',415647,false,false,0,0,0,3,1),
    ('grading_assignments',405892,true,true,1,1,7,2,10),
    ('improvement_verifications',413244,true,true,1,2,3,0,4),
    ('initiative_impact_snapshots',414553,true,true,1,1,4,1,5),
    ('instructor_supplement_reviews',404537,false,false,0,1,3,0,5),
    ('learner_benefit_entitlements',408725,true,true,1,0,4,2,6),
    ('official_authorization_events',408425,false,false,0,1,3,0,4),
    ('production_deliverables',404238,false,false,0,1,3,3,5),
    ('qualification_answer_guidance_rules',418042,true,true,1,1,3,0,3),
    ('qualification_conditions',417652,true,true,1,2,3,0,4),
    ('qualification_evaluation_answers',417507,true,true,1,2,4,0,5),
    ('qualification_evaluation_control_verifications',417556,true,true,1,1,2,0,2),
    ('qualification_evaluation_facility_verifications',417539,true,true,1,1,2,0,2),
    ('qualification_evidence_access_grants',417154,true,true,1,1,5,0,6),
    ('qualification_evidence_types',416768,true,true,1,1,0,1,1),
    ('qualification_network_reporting_grants',418880,true,true,1,1,6,0,3),
    ('qualification_operational_gates',417762,true,true,1,1,6,0,7),
    ('qualification_person_consents',416860,true,true,1,1,3,1,4),
    ('qualification_template_reviews',416597,true,true,1,1,3,0,5),
    ('readiness_evaluation_requirements',410762,true,true,1,1,2,1,5),
    ('readiness_requirement_evidence',410791,true,true,1,1,4,0,5),
    ('workforce_compensation_agreements',409145,true,true,1,0,4,1,5),
    ('workforce_compensation_terms',409182,true,true,1,0,3,3,6)
) snapshot(name,source_oid,rls,force_rls,policy_count,trigger_count,outbound_fks,inbound_fks,index_count)) v ON p.prosrc ILIKE '%'||v.name||'%'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',fn.proc_id);
  END LOOP;
  FOR v IN SELECT * FROM (VALUES
    ('academic_credit_awards',407196,true,true,1,2,6,2,10),
    ('academic_framework_review_decisions',409703,true,true,1,1,4,0,6),
    ('academic_framework_version_competencies',406337,false,false,0,2,3,0,4),
    ('application_decisions',413448,true,true,1,2,5,2,6),
    ('assessment_item_assets',406174,false,false,0,1,2,0,2),
    ('assessment_review_events',407107,true,true,1,1,3,0,4),
    ('assessment_scoring_assignments',406920,true,true,1,1,4,2,7),
    ('assurance_control_versions',411344,true,true,1,1,3,2,4),
    ('blueprint_component_dependencies',403098,false,false,0,1,2,0,3),
    ('competency_prerequisites',409670,false,false,0,1,3,0,4),
    ('competency_version_withdrawals',406311,false,false,0,1,2,0,3),
    ('contractual_milestones',408860,false,false,0,0,3,2,5),
    ('control_evaluations',411422,true,true,1,1,4,6,5),
    ('creator_commissions',404194,false,false,0,0,5,1,7),
    ('credential_issuance_support',413313,true,true,1,2,8,0,9),
    ('deployment_readiness_evidence_checks',416449,true,true,1,1,3,0,4),
    ('education_service_evidence',408771,true,true,1,0,6,1,8),
    ('evaluation_basis_dependencies',418784,true,true,1,1,8,1,1),
    ('experience_metrics',412981,false,false,0,0,1,1,3),
    ('foundation_activities',409920,false,false,0,2,2,2,5),
    ('foundation_release_review_decisions',410054,true,true,1,1,5,0,7),
    ('foundation_resource_bindings',409957,false,false,0,1,4,0,5),
    ('funding_claim_lines',409001,true,true,1,2,2,0,3),
    ('funding_cost_categories',415647,false,false,0,0,0,3,1),
    ('grading_assignments',405892,true,true,1,1,7,2,10),
    ('improvement_verifications',413244,true,true,1,2,3,0,4),
    ('initiative_impact_snapshots',414553,true,true,1,1,4,1,5),
    ('instructor_supplement_reviews',404537,false,false,0,1,3,0,5),
    ('learner_benefit_entitlements',408725,true,true,1,0,4,2,6),
    ('official_authorization_events',408425,false,false,0,1,3,0,4),
    ('production_deliverables',404238,false,false,0,1,3,3,5),
    ('qualification_answer_guidance_rules',418042,true,true,1,1,3,0,3),
    ('qualification_conditions',417652,true,true,1,2,3,0,4),
    ('qualification_evaluation_answers',417507,true,true,1,2,4,0,5),
    ('qualification_evaluation_control_verifications',417556,true,true,1,1,2,0,2),
    ('qualification_evaluation_facility_verifications',417539,true,true,1,1,2,0,2),
    ('qualification_evidence_access_grants',417154,true,true,1,1,5,0,6),
    ('qualification_evidence_types',416768,true,true,1,1,0,1,1),
    ('qualification_network_reporting_grants',418880,true,true,1,1,6,0,3),
    ('qualification_operational_gates',417762,true,true,1,1,6,0,7),
    ('qualification_person_consents',416860,true,true,1,1,3,1,4),
    ('qualification_template_reviews',416597,true,true,1,1,3,0,5),
    ('readiness_evaluation_requirements',410762,true,true,1,1,2,1,5),
    ('readiness_requirement_evidence',410791,true,true,1,1,4,0,5),
    ('workforce_compensation_agreements',409145,true,true,1,0,4,1,5),
    ('workforce_compensation_terms',409182,true,true,1,0,3,3,6)
) snapshot(name,source_oid,rls,force_rls,policy_count,trigger_count,outbound_fks,inbound_fks,index_count) LOOP
    source_oid:=to_regclass(format('public.%I',v.name));
    IF source_oid IS DISTINCT FROM v.source_oid::oid
       OR to_regclass(format('education_v30.%I',v.name)) IS NOT NULL
       OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=source_oid
         AND c.relkind='r' AND c.relrowsecurity=v.rls AND c.relforcerowsecurity=v.force_rls
         AND c.relacl IS NULL)
       OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=source_oid)<>v.policy_count
       OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=source_oid AND NOT t.tgisinternal)<>v.trigger_count
       OR (SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.conrelid=source_oid)<>v.outbound_fks
       OR (SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.confrelid=source_oid)<>v.inbound_fks
       OR (SELECT count(*) FROM pg_index i WHERE i.indrelid=source_oid)<>v.index_count
    THEN RAISE EXCEPTION 'Postflight structural verification failed: %',v.name; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I',v.name) INTO row_count;
    IF row_count<>0 THEN RAISE EXCEPTION 'Unexpected data after moving: %',v.name; END IF;
  END LOOP;
  FOR fn IN
    SELECT DISTINCT p.oid,p.oid::regprocedure AS proc_id,p.proconfig
    FROM pg_proc p JOIN (SELECT * FROM (VALUES
    ('academic_credit_awards',407196,true,true,1,2,6,2,10),
    ('academic_framework_review_decisions',409703,true,true,1,1,4,0,6),
    ('academic_framework_version_competencies',406337,false,false,0,2,3,0,4),
    ('application_decisions',413448,true,true,1,2,5,2,6),
    ('assessment_item_assets',406174,false,false,0,1,2,0,2),
    ('assessment_review_events',407107,true,true,1,1,3,0,4),
    ('assessment_scoring_assignments',406920,true,true,1,1,4,2,7),
    ('assurance_control_versions',411344,true,true,1,1,3,2,4),
    ('blueprint_component_dependencies',403098,false,false,0,1,2,0,3),
    ('competency_prerequisites',409670,false,false,0,1,3,0,4),
    ('competency_version_withdrawals',406311,false,false,0,1,2,0,3),
    ('contractual_milestones',408860,false,false,0,0,3,2,5),
    ('control_evaluations',411422,true,true,1,1,4,6,5),
    ('creator_commissions',404194,false,false,0,0,5,1,7),
    ('credential_issuance_support',413313,true,true,1,2,8,0,9),
    ('deployment_readiness_evidence_checks',416449,true,true,1,1,3,0,4),
    ('education_service_evidence',408771,true,true,1,0,6,1,8),
    ('evaluation_basis_dependencies',418784,true,true,1,1,8,1,1),
    ('experience_metrics',412981,false,false,0,0,1,1,3),
    ('foundation_activities',409920,false,false,0,2,2,2,5),
    ('foundation_release_review_decisions',410054,true,true,1,1,5,0,7),
    ('foundation_resource_bindings',409957,false,false,0,1,4,0,5),
    ('funding_claim_lines',409001,true,true,1,2,2,0,3),
    ('funding_cost_categories',415647,false,false,0,0,0,3,1),
    ('grading_assignments',405892,true,true,1,1,7,2,10),
    ('improvement_verifications',413244,true,true,1,2,3,0,4),
    ('initiative_impact_snapshots',414553,true,true,1,1,4,1,5),
    ('instructor_supplement_reviews',404537,false,false,0,1,3,0,5),
    ('learner_benefit_entitlements',408725,true,true,1,0,4,2,6),
    ('official_authorization_events',408425,false,false,0,1,3,0,4),
    ('production_deliverables',404238,false,false,0,1,3,3,5),
    ('qualification_answer_guidance_rules',418042,true,true,1,1,3,0,3),
    ('qualification_conditions',417652,true,true,1,2,3,0,4),
    ('qualification_evaluation_answers',417507,true,true,1,2,4,0,5),
    ('qualification_evaluation_control_verifications',417556,true,true,1,1,2,0,2),
    ('qualification_evaluation_facility_verifications',417539,true,true,1,1,2,0,2),
    ('qualification_evidence_access_grants',417154,true,true,1,1,5,0,6),
    ('qualification_evidence_types',416768,true,true,1,1,0,1,1),
    ('qualification_network_reporting_grants',418880,true,true,1,1,6,0,3),
    ('qualification_operational_gates',417762,true,true,1,1,6,0,7),
    ('qualification_person_consents',416860,true,true,1,1,3,1,4),
    ('qualification_template_reviews',416597,true,true,1,1,3,0,5),
    ('readiness_evaluation_requirements',410762,true,true,1,1,2,1,5),
    ('readiness_requirement_evidence',410791,true,true,1,1,4,0,5),
    ('workforce_compensation_agreements',409145,true,true,1,0,4,1,5),
    ('workforce_compensation_terms',409182,true,true,1,0,3,3,6)
) snapshot(name,source_oid,rls,force_rls,policy_count,trigger_count,outbound_fks,inbound_fks,index_count)) v ON p.prosrc ILIKE '%'||v.name||'%'
  LOOP
    IF fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[]
    THEN RAISE EXCEPTION 'Function search path was not rebound: %',fn.proc_id; END IF;
  END LOOP;
  RAISE NOTICE 'Migrated 46 tables and rebound 34 routines to trusted public fallback';
END $batch$;