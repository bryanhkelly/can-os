-- Rollback-only integration regression; synthetic reviews are test evidence only.
DO $qa$
DECLARE org uuid:=gen_random_uuid(); author uuid:=gen_random_uuid(); reviewer uuid:=gen_random_uuid(); person_a uuid:=gen_random_uuid(); person_b uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); offering uuid:=gen_random_uuid(); ov uuid:=gen_random_uuid(); course uuid:=gen_random_uuid(); cv uuid:=gen_random_uuid(); dep uuid:=gen_random_uuid(); adoption uuid:=gen_random_uuid(); training uuid:=gen_random_uuid(); pol uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); evidence uuid:=gen_random_uuid(); bank uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); iv uuid:=gen_random_uuid(); adf uuid; av uuid; frm uuid; fv uuid; sect uuid; admin uuid; baseline uuid; final uuid; baseline_admin uuid; final_admin uuid; final_form uuid; reg uuid; ca uuid; reg_b uuid; ca_b uuid; phase text; k text; n int; results jsonb;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true) IS DISTINCT FROM current_setting('can.qa_expected_branch',true)
 OR coalesce(current_setting('neon.branch_id',true),'') IN ('','br-restless-sea-ar9ooo55','br-bitter-feather-ar0u63x7')
 THEN RAISE EXCEPTION 'Dedicated nonproduction QA branch required'; END IF;
 BEGIN
 INSERT INTO public.organizations(id,type,name,slug,metadata,lifecycle_status) VALUES(org,'other_partner','TEST ONLY - Pilot QA','pilot-qa-'||org,'{"qa_only":true}','active');
 INSERT INTO public.people(id,legal_first_name,legal_last_name,metadata) SELECT x,'TEST','ONLY','{"qa_only":true}' FROM unnest(ARRAY[author,reviewer,person_a,person_b]) x;
 INSERT INTO public.education_operations(id,code,name,kind_code,status) VALUES(op,'QA-'||op,'TEST ONLY','learning_center','active');
 INSERT INTO public.education_operation_organization_roles(operation_id,organization_id,role_code,valid_from,status) VALUES(op,org,'operator',now()-interval '1 day','approved');
 INSERT INTO public.offerings(id,publisher_organization_id,code,title,status) VALUES(offering,org,'QA-'||offering,'TEST ONLY','active');
 INSERT INTO public.offering_versions(id,offering_id,version_no,lifecycle) VALUES(ov,offering,1,'draft');
 INSERT INTO public.courses(id,publisher_organization_id,course_code,title,subject) VALUES(course,org,'QA-'||course,'TEST ONLY','QA');
 INSERT INTO public.course_versions(id,course_id,version_no,lifecycle,published_at) VALUES(cv,course,1,'published',now());
 INSERT INTO public.offering_courses(offering_version_id,course_version_id,is_required,sequence_no) VALUES(ov,cv,true,1);
 INSERT INTO public.offering_release_requirements(offering_version_id,course_version_id,minimum_approved_primary_tracks,complete_lesson_coverage_required,independent_academic_review_required,rights_clearance_required,accessibility_review_required) VALUES(ov,cv,0,false,false,false,false);
 UPDATE public.offering_versions SET lifecycle='published',published_at=now() WHERE id=ov;
 INSERT INTO public.program_deployments(id,operation_id,offering_id,code,name,status) VALUES(dep,op,offering,'QA-'||dep,'TEST ONLY','active');
 INSERT INTO public.deployment_offering_adoptions(id,deployment_id,offering_id,offering_version_id,valid_from,approval_status,approved_by_person_id,approved_at) VALUES(adoption,dep,offering,ov,now()-interval '1 day','approved',reviewer,now());
 INSERT INTO public.evidence_documents(id,kind_code,owning_organization_id,title,privacy_class) VALUES(doc,'instruction',org,'TEST ONLY','restricted');
 INSERT INTO public.evidence_document_versions(id,document_id,version_no,verified_by_person_id,verified_at) VALUES(evidence,doc,1,reviewer,now());
 INSERT INTO public.operational_authorization_decisions(stage_code,deployment_id,authority_organization_id,authorizing_person_id,decision,valid_from,evidence_version_id) VALUES('register_noncredit',dep,org,reviewer,'approved',now()-interval '1 hour',evidence);
 INSERT INTO public.assessment_item_banks(id,owner_organization_id,bank_code,title) VALUES(bank,org,'QA-'||bank,'TEST ONLY');
 INSERT INTO public.assessment_items(id,bank_id,item_key,title,created_by_person_id) VALUES(item,bank,'qa-item','TEST ONLY',author);
 INSERT INTO public.assessment_item_versions(id,item_id,version_no,response_kind,lifecycle) VALUES(iv,item,1,'single_select','draft');
 FOREACH k IN ARRAY ARRAY['academic','rights','accessibility'] LOOP
 INSERT INTO public.assessment_item_review_decisions(item_version_id,reviewer_person_id,review_kind,decision) VALUES(iv,reviewer,k,'approved');
 END LOOP;
 UPDATE public.assessment_item_versions SET lifecycle='published',published_at=now() WHERE id=iv;
 FOREACH phase IN ARRAY ARRAY['diagnostic','formative'] LOOP
 adf:=gen_random_uuid(); av:=gen_random_uuid(); frm:=gen_random_uuid(); fv:=gen_random_uuid(); sect:=gen_random_uuid(); admin:=gen_random_uuid();
 INSERT INTO public.assessment_definitions(id,owner_organization_id,assessment_key,title,purpose,course_id) VALUES(adf,org,'QA-'||adf,'TEST ONLY',phase,course);
 INSERT INTO public.assessment_versions(id,assessment_id,course_version_id,assessment_key,version_no,lifecycle) VALUES(av,adf,cv,'QA-'||av,1,'draft');
 FOREACH k IN ARRAY ARRAY['academic','rights','accessibility','independent'] LOOP
 INSERT INTO public.assessment_version_review_decisions(assessment_version_id,reviewer_person_id,review_kind,decision) VALUES(av,reviewer,k,'approved');
 END LOOP;
 UPDATE public.assessment_versions SET lifecycle='published',published_at=now() WHERE id=av;
 INSERT INTO public.assessment_forms(id,assessment_id,form_key,title) VALUES(frm,adf,'qa','TEST ONLY');
 INSERT INTO public.assessment_form_versions(id,form_id,assessment_id,assessment_version_id,version_no,lifecycle) VALUES(fv,frm,adf,av,1,'draft');
 INSERT INTO public.assessment_form_sections(id,form_version_id,section_key,title,ordinal) VALUES(sect,fv,'qa','TEST ONLY',1);
 INSERT INTO public.assessment_form_items(form_version_id,form_section_id,item_version_id,position) VALUES(fv,sect,iv,1);
 FOREACH k IN ARRAY ARRAY['academic','rights','accessibility'] LOOP
 INSERT INTO public.assessment_form_review_decisions(form_version_id,reviewer_person_id,review_kind,decision) VALUES(fv,reviewer,k,'approved');
 END LOOP;
 UPDATE public.assessment_form_versions SET lifecycle='published',published_at=now() WHERE id=fv;
 INSERT INTO public.assessment_administrations(id,administering_organization_id,assessment_version_id,form_version_id,operation_id,deployment_id,course_version_id,administration_code,status,proctor_policy) VALUES(admin,org,av,fv,op,dep,cv,'QA-'||admin,'open','none');
 IF phase='diagnostic' THEN baseline:=av; baseline_admin:=admin; ELSE final:=av; final_admin:=admin; final_form:=fv; END IF;
 END LOOP;
 INSERT INTO public.noncredit_training_versions(id,offering_version_id,provider_organization_id,title,required_instruction_minutes,state,published_at,author_person_id,approved_by_person_id,assessment_version_id,baseline_assessment_version_id) VALUES(training,ov,org,'TEST ONLY',0,'published',now(),author,reviewer,final,baseline);
 INSERT INTO public.noncredit_completion_policies(id,training_version_id,policy_version,min_participation_minutes,skills_assessment_required,minimum_assessment_fraction,effective_at,approved_by_person_id,published_at,require_all_lessons,completion_mode) VALUES(pol,training,1,0,true,0.8,now()-interval '1 hour',reviewer,now(),true,'automatic');
 INSERT INTO public.noncredit_registrations(deployment_id,training_version_id,adoption_id,offering_version_id,participant_person_id,registering_organization_id,status) VALUES(dep,training,adoption,ov,person_a,org,'registered') RETURNING id INTO reg;
 INSERT INTO public.learner_course_attempts(noncredit_registration_id,deployment_id,adoption_id,offering_version_id,course_version_id,attempt_no,status) VALUES(reg,dep,adoption,ov,cv,1,'active') RETURNING id INTO ca;
 SELECT count(*) INTO n FROM public.assessment_access_grants WHERE course_attempt_id=ca AND administration_id IN(baseline_admin,final_admin) AND access_status='approved';
 IF n<>2 THEN RAISE EXCEPTION 'Expected two grants; got %',n; END IF;
 PERFORM education_v30.v301_provision_noncredit_knowledge_access(ca);
 IF (SELECT count(*) FROM public.assessment_access_grants WHERE course_attempt_id=ca)<>2 THEN RAISE EXCEPTION 'Non-idempotent grant'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.noncredit_registrations r JOIN public.learner_profiles l ON l.id=r.learner_id WHERE r.id=reg AND l.person_id=person_a AND r.completion_policy_id=pol) THEN RAISE EXCEPTION 'Identity or policy linkage failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.noncredit_completion_decisions WHERE registration_id=reg) THEN RAISE EXCEPTION 'Premature completion'; END IF;
 -- Another eligible administration makes the final phase ambiguous. A fresh
 -- learner may receive the single baseline grant, but never a guessed final.
 INSERT INTO public.assessment_administrations(administering_organization_id,assessment_version_id,form_version_id,operation_id,deployment_id,course_version_id,administration_code,status,proctor_policy) VALUES(org,final,final_form,op,dep,cv,'QA-duplicate-'||dep,'open','none');
 INSERT INTO public.noncredit_registrations(deployment_id,training_version_id,adoption_id,offering_version_id,participant_person_id,registering_organization_id,status) VALUES(dep,training,adoption,ov,person_b,org,'registered') RETURNING id INTO reg_b;
 INSERT INTO public.learner_course_attempts(noncredit_registration_id,deployment_id,adoption_id,offering_version_id,course_version_id,attempt_no,status) VALUES(reg_b,dep,adoption,ov,cv,1,'active') RETURNING id INTO ca_b;
 IF (SELECT count(*) FROM public.assessment_access_grants WHERE course_attempt_id=ca_b)<>1 OR NOT EXISTS(SELECT 1 FROM public.assessment_access_grants WHERE course_attempt_id=ca_b AND administration_id=baseline_admin) THEN RAISE EXCEPTION 'Ambiguous final assessment must fail closed'; END IF;
 IF EXISTS(SELECT 1 FROM public.assessment_access_grants a JOIN public.assessment_access_grants x ON a.learner_id=x.learner_id WHERE a.course_attempt_id=ca AND x.course_attempt_id=ca_b) THEN RAISE EXCEPTION 'Cross-learner grant'; END IF;
 results:=jsonb_build_object('assessment_grants',n,'repeat_idempotent',true,'learner_and_policy_pinned',true,'no_premature_completion',true,'ambiguous_final_denied',true,'distinct_learner_grants',true);
 RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='QA rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN INSERT INTO pg_temp.pilot_qa_result VALUES(results);
 END;
 IF EXISTS(SELECT 1 FROM public.organizations WHERE id=org) OR EXISTS(SELECT 1 FROM public.people WHERE id IN(author,reviewer,person_a,person_b)) OR EXISTS(SELECT 1 FROM public.learner_course_attempts WHERE id IN(ca,ca_b)) THEN RAISE EXCEPTION 'Synthetic fixture was not rolled back'; END IF;
END $qa$;
