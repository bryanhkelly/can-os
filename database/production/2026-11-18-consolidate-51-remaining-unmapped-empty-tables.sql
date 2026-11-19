-- Main-only CAN OS consolidation: 51 zero-row, noncolliding source tables.
-- No DROP, CASCADE, data copy, or bridge tables. Identity/OID, FK, RLS, ACL,
-- triggers and indexes preserved. Verified empty before and after.
-- Rebind stored routine search paths when their bodies refer to moved tables.
-- Runtime mappings and acceptance require separate verification.
-- Single atomic DO call: errors abort all changes.
DO $migration$
DECLARE rec record; fn record; rel oid; row_count bigint; changed_fn int:=0;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'CAN OS Neon main required'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public CREATE privilege would compromise SECURITY DEFINER'; END IF;
 FOR rec IN SELECT * FROM (VALUES
('academic_framework_versions',406241,false,false,0,2,2,3,4),
('academic_frameworks',406216,false,false,0,0,1,2,2),
('assessment_item_competencies',406405,false,false,0,1,2,0,2),
('competency_determination_evidence',410693,true,true,1,1,2,0,3),
('competency_mastery_policy_versions',410531,false,false,0,1,1,2,2),
('competency_versions',406274,false,false,0,2,2,12,4),
('control_obligations',411380,true,true,1,1,5,2,6),
('course_readiness_profile_versions',410385,false,false,0,1,3,3,6),
('course_readiness_requirements',410422,false,false,0,1,2,2,6),
('credential_issuances',407343,false,false,0,1,4,1,5),
('education_networks',402313,false,false,0,0,1,12,3),
('eligible_operating_costs',408824,false,false,0,0,3,3,5),
('equipment_assets',415154,true,true,2,0,3,6,4),
('evaluation_bases',418743,true,true,1,0,5,2,1),
('foundation_delivery_policy_versions',410483,false,false,0,1,1,3,2),
('foundation_distribution_rights',410141,false,false,0,1,6,1,8),
('foundation_instructional_release_assets',410032,false,false,0,1,2,0,2),
('foundation_instructional_releases',409994,false,false,0,2,3,3,5),
('foundation_module_competencies',409899,false,false,0,1,2,0,2),
('foundation_program_adoptions',410197,false,false,0,1,7,2,10),
('foundation_withdrawals',410101,false,false,0,1,5,0,6),
('fundable_sources',408895,false,false,0,2,3,3,8),
('funding_allocation_attributions',415813,true,true,1,3,11,0,12),
('funding_applications',415536,true,true,1,0,4,4,5),
('funding_award_budget_lines',415693,true,true,1,2,2,3,4),
('funding_award_spending_limits',415720,true,true,1,2,2,0,3),
('funding_claims',408975,true,true,1,1,2,1,4),
('funding_cost_classifications',415771,true,true,1,0,5,2,7),
('funding_programs',408546,false,false,0,0,3,6,5),
('graded_assignments',405773,false,false,0,1,4,1,6),
('grading_decisions',405951,true,true,1,2,6,2,7),
('improvement_actions',413188,true,true,1,0,3,4,4),
('initiative_metric_observations',414595,true,true,1,1,4,1,4),
('initiative_success_metrics',414494,false,false,0,0,1,2,2),
('instructor_supplement_tasks',404496,false,false,0,1,3,3,7),
('instructor_supplement_versions',404452,false,false,0,2,3,5,6),
('instructor_supplements',404426,false,false,0,0,2,1,4),
('learner_competency_determinations',410635,true,true,1,2,6,4,9),
('learner_competency_evidence',407139,true,true,1,3,5,2,9),
('metric_observations',413004,true,true,1,2,6,2,7),
('official_assessment_result_adoptions',407062,true,true,1,2,5,1,6),
('official_authorizations',408333,false,false,0,0,3,5,4),
('production_review_decisions',404274,false,false,0,1,3,0,5),
('professional_screening_decisions',402979,true,true,1,0,5,1,6),
('program_applications',408157,true,true,1,0,4,1,5),
('program_readiness_policy_adoptions',410565,false,false,0,1,9,1,11),
('qualification_decision_requirements',417626,true,true,1,1,3,0,5),
('qualification_evidence_events',417330,true,true,1,3,4,0,5),
('qualification_questionnaire_bindings',416667,true,true,1,1,2,2,5),
('qualification_requirement_conditions',416735,true,true,1,1,3,0,5),
('site_spaces',402554,false,false,0,0,1,3,3)
) AS snap(name,source_oid,rls,force_rls,pol,trg,outf,inf,idx) LOOP
   rel:=to_regclass(format('education_v30.%I',rec.name));
   IF rel IS DISTINCT FROM rec.source_oid::oid
      OR to_regclass(format('public.%I',rec.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
      AND c.relrowsecurity=rec.rls AND c.relforcerowsecurity=rec.force_rls AND c.relacl IS NULL)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>rec.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>rec.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=rel)<>rec.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=rel)<>rec.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>rec.idx
      OR EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%'||rec.name||'%')
      OR EXISTS(SELECT 1 FROM pg_proc WHERE prosrc ILIKE '%education_v30.'||rec.name||'%')
      OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid WHERE i.indrelid=rel
      AND EXISTS(SELECT 1 FROM pg_class p WHERE p.relnamespace='public'::regnamespace AND p.relname=ix.relname))
      OR has_table_privilege('authenticated',rel,'SELECT')
      OR has_table_privilege('authenticated',rel,'INSERT')
      OR has_table_privilege('authenticated',rel,'UPDATE')
      OR has_table_privilege('authenticated',rel,'DELETE')
   THEN RAISE EXCEPTION 'Table preflight failed %',rec.name; END IF;
   EXECUTE format('SELECT COUNT(*) FROM education_v30.%I',rec.name) INTO row_count;
   IF row_count<>0 THEN RAISE EXCEPTION 'Nonempty table % (% rows)',rec.name,row_count; END IF;
 END LOOP;
 -- Each referenced routine must either use the secure legacy search path or
 -- already include public in that path; the current schema stays first.
 FOR fn IN
    SELECT DISTINCT p.oid,p.oid::regprocedure AS proc_id,p.proconfig,
      pg_get_userbyid(p.proowner) AS routine_owner,n.nspname AS routine_schema
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN (VALUES
('academic_framework_versions',406241,false,false,0,2,2,3,4),
('academic_frameworks',406216,false,false,0,0,1,2,2),
('assessment_item_competencies',406405,false,false,0,1,2,0,2),
('competency_determination_evidence',410693,true,true,1,1,2,0,3),
('competency_mastery_policy_versions',410531,false,false,0,1,1,2,2),
('competency_versions',406274,false,false,0,2,2,12,4),
('control_obligations',411380,true,true,1,1,5,2,6),
('course_readiness_profile_versions',410385,false,false,0,1,3,3,6),
('course_readiness_requirements',410422,false,false,0,1,2,2,6),
('credential_issuances',407343,false,false,0,1,4,1,5),
('education_networks',402313,false,false,0,0,1,12,3),
('eligible_operating_costs',408824,false,false,0,0,3,3,5),
('equipment_assets',415154,true,true,2,0,3,6,4),
('evaluation_bases',418743,true,true,1,0,5,2,1),
('foundation_delivery_policy_versions',410483,false,false,0,1,1,3,2),
('foundation_distribution_rights',410141,false,false,0,1,6,1,8),
('foundation_instructional_release_assets',410032,false,false,0,1,2,0,2),
('foundation_instructional_releases',409994,false,false,0,2,3,3,5),
('foundation_module_competencies',409899,false,false,0,1,2,0,2),
('foundation_program_adoptions',410197,false,false,0,1,7,2,10),
('foundation_withdrawals',410101,false,false,0,1,5,0,6),
('fundable_sources',408895,false,false,0,2,3,3,8),
('funding_allocation_attributions',415813,true,true,1,3,11,0,12),
('funding_applications',415536,true,true,1,0,4,4,5),
('funding_award_budget_lines',415693,true,true,1,2,2,3,4),
('funding_award_spending_limits',415720,true,true,1,2,2,0,3),
('funding_claims',408975,true,true,1,1,2,1,4),
('funding_cost_classifications',415771,true,true,1,0,5,2,7),
('funding_programs',408546,false,false,0,0,3,6,5),
('graded_assignments',405773,false,false,0,1,4,1,6),
('grading_decisions',405951,true,true,1,2,6,2,7),
('improvement_actions',413188,true,true,1,0,3,4,4),
('initiative_metric_observations',414595,true,true,1,1,4,1,4),
('initiative_success_metrics',414494,false,false,0,0,1,2,2),
('instructor_supplement_tasks',404496,false,false,0,1,3,3,7),
('instructor_supplement_versions',404452,false,false,0,2,3,5,6),
('instructor_supplements',404426,false,false,0,0,2,1,4),
('learner_competency_determinations',410635,true,true,1,2,6,4,9),
('learner_competency_evidence',407139,true,true,1,3,5,2,9),
('metric_observations',413004,true,true,1,2,6,2,7),
('official_assessment_result_adoptions',407062,true,true,1,2,5,1,6),
('official_authorizations',408333,false,false,0,0,3,5,4),
('production_review_decisions',404274,false,false,0,1,3,0,5),
('professional_screening_decisions',402979,true,true,1,0,5,1,6),
('program_applications',408157,true,true,1,0,4,1,5),
('program_readiness_policy_adoptions',410565,false,false,0,1,9,1,11),
('qualification_decision_requirements',417626,true,true,1,1,3,0,5),
('qualification_evidence_events',417330,true,true,1,3,4,0,5),
('qualification_questionnaire_bindings',416667,true,true,1,1,2,2,5),
('qualification_requirement_conditions',416735,true,true,1,1,3,0,5),
('site_spaces',402554,false,false,0,0,1,3,3)
) AS candidate(name,source_oid,rls,force_rls,pol,trg,outf,inf,idx) ON p.prosrc ILIKE '%'||candidate.name||'%'
 LOOP
    IF fn.routine_owner<>'neondb_owner' OR fn.routine_schema<>'education_v30'
      OR (fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog']::text[]
          AND fn.proconfig IS DISTINCT FROM ARRAY['search_path=education_v30, pg_catalog, public']::text[])
    THEN RAISE EXCEPTION 'Unexpected routine owner or search path %',fn.proc_id; END IF;
 END LOOP;
 FOR rec IN SELECT * FROM (VALUES
('academic_framework_versions',406241,false,false,0,2,2,3,4),
('academic_frameworks',406216,false,false,0,0,1,2,2),
('assessment_item_competencies',406405,false,false,0,1,2,0,2),
('competency_determination_evidence',410693,true,true,1,1,2,0,3),
('competency_mastery_policy_versions',410531,false,false,0,1,1,2,2),
('competency_versions',406274,false,false,0,2,2,12,4),
('control_obligations',411380,true,true,1,1,5,2,6),
('course_readiness_profile_versions',410385,false,false,0,1,3,3,6),
('course_readiness_requirements',410422,false,false,0,1,2,2,6),
('credential_issuances',407343,false,false,0,1,4,1,5),
('education_networks',402313,false,false,0,0,1,12,3),
('eligible_operating_costs',408824,false,false,0,0,3,3,5),
('equipment_assets',415154,true,true,2,0,3,6,4),
('evaluation_bases',418743,true,true,1,0,5,2,1),
('foundation_delivery_policy_versions',410483,false,false,0,1,1,3,2),
('foundation_distribution_rights',410141,false,false,0,1,6,1,8),
('foundation_instructional_release_assets',410032,false,false,0,1,2,0,2),
('foundation_instructional_releases',409994,false,false,0,2,3,3,5),
('foundation_module_competencies',409899,false,false,0,1,2,0,2),
('foundation_program_adoptions',410197,false,false,0,1,7,2,10),
('foundation_withdrawals',410101,false,false,0,1,5,0,6),
('fundable_sources',408895,false,false,0,2,3,3,8),
('funding_allocation_attributions',415813,true,true,1,3,11,0,12),
('funding_applications',415536,true,true,1,0,4,4,5),
('funding_award_budget_lines',415693,true,true,1,2,2,3,4),
('funding_award_spending_limits',415720,true,true,1,2,2,0,3),
('funding_claims',408975,true,true,1,1,2,1,4),
('funding_cost_classifications',415771,true,true,1,0,5,2,7),
('funding_programs',408546,false,false,0,0,3,6,5),
('graded_assignments',405773,false,false,0,1,4,1,6),
('grading_decisions',405951,true,true,1,2,6,2,7),
('improvement_actions',413188,true,true,1,0,3,4,4),
('initiative_metric_observations',414595,true,true,1,1,4,1,4),
('initiative_success_metrics',414494,false,false,0,0,1,2,2),
('instructor_supplement_tasks',404496,false,false,0,1,3,3,7),
('instructor_supplement_versions',404452,false,false,0,2,3,5,6),
('instructor_supplements',404426,false,false,0,0,2,1,4),
('learner_competency_determinations',410635,true,true,1,2,6,4,9),
('learner_competency_evidence',407139,true,true,1,3,5,2,9),
('metric_observations',413004,true,true,1,2,6,2,7),
('official_assessment_result_adoptions',407062,true,true,1,2,5,1,6),
('official_authorizations',408333,false,false,0,0,3,5,4),
('production_review_decisions',404274,false,false,0,1,3,0,5),
('professional_screening_decisions',402979,true,true,1,0,5,1,6),
('program_applications',408157,true,true,1,0,4,1,5),
('program_readiness_policy_adoptions',410565,false,false,0,1,9,1,11),
('qualification_decision_requirements',417626,true,true,1,1,3,0,5),
('qualification_evidence_events',417330,true,true,1,3,4,0,5),
('qualification_questionnaire_bindings',416667,true,true,1,1,2,2,5),
('qualification_requirement_conditions',416735,true,true,1,1,3,0,5),
('site_spaces',402554,false,false,0,0,1,3,3)
) AS snap(name,source_oid,rls,force_rls,pol,trg,outf,inf,idx) LOOP
   EXECUTE format('ALTER TABLE education_v30.%I SET SCHEMA public',rec.name);
 END LOOP;
 FOR fn IN
    SELECT DISTINCT p.oid,p.oid::regprocedure AS proc_id
    FROM pg_proc p
    JOIN (VALUES
('academic_framework_versions',406241,false,false,0,2,2,3,4),
('academic_frameworks',406216,false,false,0,0,1,2,2),
('assessment_item_competencies',406405,false,false,0,1,2,0,2),
('competency_determination_evidence',410693,true,true,1,1,2,0,3),
('competency_mastery_policy_versions',410531,false,false,0,1,1,2,2),
('competency_versions',406274,false,false,0,2,2,12,4),
('control_obligations',411380,true,true,1,1,5,2,6),
('course_readiness_profile_versions',410385,false,false,0,1,3,3,6),
('course_readiness_requirements',410422,false,false,0,1,2,2,6),
('credential_issuances',407343,false,false,0,1,4,1,5),
('education_networks',402313,false,false,0,0,1,12,3),
('eligible_operating_costs',408824,false,false,0,0,3,3,5),
('equipment_assets',415154,true,true,2,0,3,6,4),
('evaluation_bases',418743,true,true,1,0,5,2,1),
('foundation_delivery_policy_versions',410483,false,false,0,1,1,3,2),
('foundation_distribution_rights',410141,false,false,0,1,6,1,8),
('foundation_instructional_release_assets',410032,false,false,0,1,2,0,2),
('foundation_instructional_releases',409994,false,false,0,2,3,3,5),
('foundation_module_competencies',409899,false,false,0,1,2,0,2),
('foundation_program_adoptions',410197,false,false,0,1,7,2,10),
('foundation_withdrawals',410101,false,false,0,1,5,0,6),
('fundable_sources',408895,false,false,0,2,3,3,8),
('funding_allocation_attributions',415813,true,true,1,3,11,0,12),
('funding_applications',415536,true,true,1,0,4,4,5),
('funding_award_budget_lines',415693,true,true,1,2,2,3,4),
('funding_award_spending_limits',415720,true,true,1,2,2,0,3),
('funding_claims',408975,true,true,1,1,2,1,4),
('funding_cost_classifications',415771,true,true,1,0,5,2,7),
('funding_programs',408546,false,false,0,0,3,6,5),
('graded_assignments',405773,false,false,0,1,4,1,6),
('grading_decisions',405951,true,true,1,2,6,2,7),
('improvement_actions',413188,true,true,1,0,3,4,4),
('initiative_metric_observations',414595,true,true,1,1,4,1,4),
('initiative_success_metrics',414494,false,false,0,0,1,2,2),
('instructor_supplement_tasks',404496,false,false,0,1,3,3,7),
('instructor_supplement_versions',404452,false,false,0,2,3,5,6),
('instructor_supplements',404426,false,false,0,0,2,1,4),
('learner_competency_determinations',410635,true,true,1,2,6,4,9),
('learner_competency_evidence',407139,true,true,1,3,5,2,9),
('metric_observations',413004,true,true,1,2,6,2,7),
('official_assessment_result_adoptions',407062,true,true,1,2,5,1,6),
('official_authorizations',408333,false,false,0,0,3,5,4),
('production_review_decisions',404274,false,false,0,1,3,0,5),
('professional_screening_decisions',402979,true,true,1,0,5,1,6),
('program_applications',408157,true,true,1,0,4,1,5),
('program_readiness_policy_adoptions',410565,false,false,0,1,9,1,11),
('qualification_decision_requirements',417626,true,true,1,1,3,0,5),
('qualification_evidence_events',417330,true,true,1,3,4,0,5),
('qualification_questionnaire_bindings',416667,true,true,1,1,2,2,5),
('qualification_requirement_conditions',416735,true,true,1,1,3,0,5),
('site_spaces',402554,false,false,0,0,1,3,3)
) AS candidate(name,source_oid,rls,force_rls,pol,trg,outf,inf,idx) ON p.prosrc ILIKE '%'||candidate.name||'%'
    WHERE p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
 LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO education_v30, pg_catalog, public',fn.proc_id);
    changed_fn:=changed_fn+1;
 END LOOP;
 FOR rec IN SELECT * FROM (VALUES
('academic_framework_versions',406241,false,false,0,2,2,3,4),
('academic_frameworks',406216,false,false,0,0,1,2,2),
('assessment_item_competencies',406405,false,false,0,1,2,0,2),
('competency_determination_evidence',410693,true,true,1,1,2,0,3),
('competency_mastery_policy_versions',410531,false,false,0,1,1,2,2),
('competency_versions',406274,false,false,0,2,2,12,4),
('control_obligations',411380,true,true,1,1,5,2,6),
('course_readiness_profile_versions',410385,false,false,0,1,3,3,6),
('course_readiness_requirements',410422,false,false,0,1,2,2,6),
('credential_issuances',407343,false,false,0,1,4,1,5),
('education_networks',402313,false,false,0,0,1,12,3),
('eligible_operating_costs',408824,false,false,0,0,3,3,5),
('equipment_assets',415154,true,true,2,0,3,6,4),
('evaluation_bases',418743,true,true,1,0,5,2,1),
('foundation_delivery_policy_versions',410483,false,false,0,1,1,3,2),
('foundation_distribution_rights',410141,false,false,0,1,6,1,8),
('foundation_instructional_release_assets',410032,false,false,0,1,2,0,2),
('foundation_instructional_releases',409994,false,false,0,2,3,3,5),
('foundation_module_competencies',409899,false,false,0,1,2,0,2),
('foundation_program_adoptions',410197,false,false,0,1,7,2,10),
('foundation_withdrawals',410101,false,false,0,1,5,0,6),
('fundable_sources',408895,false,false,0,2,3,3,8),
('funding_allocation_attributions',415813,true,true,1,3,11,0,12),
('funding_applications',415536,true,true,1,0,4,4,5),
('funding_award_budget_lines',415693,true,true,1,2,2,3,4),
('funding_award_spending_limits',415720,true,true,1,2,2,0,3),
('funding_claims',408975,true,true,1,1,2,1,4),
('funding_cost_classifications',415771,true,true,1,0,5,2,7),
('funding_programs',408546,false,false,0,0,3,6,5),
('graded_assignments',405773,false,false,0,1,4,1,6),
('grading_decisions',405951,true,true,1,2,6,2,7),
('improvement_actions',413188,true,true,1,0,3,4,4),
('initiative_metric_observations',414595,true,true,1,1,4,1,4),
('initiative_success_metrics',414494,false,false,0,0,1,2,2),
('instructor_supplement_tasks',404496,false,false,0,1,3,3,7),
('instructor_supplement_versions',404452,false,false,0,2,3,5,6),
('instructor_supplements',404426,false,false,0,0,2,1,4),
('learner_competency_determinations',410635,true,true,1,2,6,4,9),
('learner_competency_evidence',407139,true,true,1,3,5,2,9),
('metric_observations',413004,true,true,1,2,6,2,7),
('official_assessment_result_adoptions',407062,true,true,1,2,5,1,6),
('official_authorizations',408333,false,false,0,0,3,5,4),
('production_review_decisions',404274,false,false,0,1,3,0,5),
('professional_screening_decisions',402979,true,true,1,0,5,1,6),
('program_applications',408157,true,true,1,0,4,1,5),
('program_readiness_policy_adoptions',410565,false,false,0,1,9,1,11),
('qualification_decision_requirements',417626,true,true,1,1,3,0,5),
('qualification_evidence_events',417330,true,true,1,3,4,0,5),
('qualification_questionnaire_bindings',416667,true,true,1,1,2,2,5),
('qualification_requirement_conditions',416735,true,true,1,1,3,0,5),
('site_spaces',402554,false,false,0,0,1,3,3)
) AS snap(name,source_oid,rls,force_rls,pol,trg,outf,inf,idx) LOOP
   rel:=to_regclass(format('public.%I',rec.name));
   IF rel IS DISTINCT FROM rec.source_oid::oid
      OR to_regclass(format('education_v30.%I',rec.name)) IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
          AND c.relrowsecurity=rec.rls AND c.relforcerowsecurity=rec.force_rls AND c.relacl IS NULL)
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>rec.pol
      OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>rec.trg
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=rel)<>rec.outf
      OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=rel)<>rec.inf
      OR (SELECT count(*) FROM pg_index WHERE indrelid=rel)<>rec.idx
   THEN RAISE EXCEPTION 'Postflight failed %',rec.name; END IF;
   EXECUTE format('SELECT COUNT(*) FROM public.%I',rec.name) INTO row_count;
   IF row_count<>0 THEN RAISE EXCEPTION 'Postflight rows changed %',rec.name; END IF;
 END LOOP;
 RAISE NOTICE 'Moved 51 tables and rebound % routines',changed_fn;
END $migration$;