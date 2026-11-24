-- Rollback-only integration regression; synthetic reviews are test evidence only.
DO $qa$
DECLARE org uuid:=gen_random_uuid(); author uuid:=gen_random_uuid(); reviewer uuid:=gen_random_uuid(); person_a uuid:=gen_random_uuid(); person_b uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); offering uuid:=gen_random_uuid(); ov uuid:=gen_random_uuid(); course uuid:=gen_random_uuid(); cv uuid:=gen_random_uuid(); dep uuid:=gen_random_uuid(); adoption uuid:=gen_random_uuid(); training uuid:=gen_random_uuid(); pol uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); evidence uuid:=gen_random_uuid(); bank uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); iv uuid:=gen_random_uuid(); adf uuid; av uuid; frm uuid; fv uuid; sect uuid; admin uuid; baseline uuid; final uuid; baseline_admin uuid; final_admin uuid; final_form uuid; reg uuid; ca uuid; reg_b uuid; ca_b uuid; phase text; k text; n int; results jsonb; unit_id uuid:=gen_random_uuid(); lesson record; final_grant uuid; learner uuid; attempt uuid; attempt_item uuid; response uuid; form_item uuid; final_result uuid; completion_id uuid; option_id uuid:=gen_random_uuid(); survey_id uuid:=gen_random_uuid(); sv uuid:=gen_random_uuid(); campaign uuid:=gen_random_uuid(); disabled_campaign uuid:=gen_random_uuid(); other_campaign uuid:=gen_random_uuid(); invitation uuid; survey_response uuid; q record; baseline_form uuid; other_org uuid:=gen_random_uuid();
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
 INSERT INTO public.course_versions(id,course_id,version_no,lifecycle) VALUES(cv,course,1,'draft');
 INSERT INTO public.course_units(id,course_version_id,unit_key,title,sequence_no) VALUES(unit_id,cv,'qa','TEST ONLY',1);
 INSERT INTO public.course_lessons(course_version_id,course_unit_id,lesson_key,title,lesson_order) SELECT cv,unit_id,'lesson-'||i,'TEST ONLY lesson '||i,i FROM generate_series(1,7) i;
 UPDATE public.course_versions SET lifecycle='published',published_at=now() WHERE id=cv;
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
 INSERT INTO public.assessment_item_options(id,item_version_id,option_key,ordinal,display_content) VALUES(option_id,iv,'qa-correct',1,'{"text":"Synthetic test option"}');
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
 IF phase='diagnostic' THEN baseline:=av; baseline_admin:=admin; baseline_form:=fv; ELSE final:=av; final_admin:=admin; final_form:=fv; END IF;
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
 INSERT INTO public.organizations(id,type,name,slug,metadata,lifecycle_status) VALUES(other_org,'other_partner','TEST ONLY - other operator','pilot-qa-'||other_org,'{"qa_only":true}','active');
 INSERT INTO public.survey_definitions(id,owner_organization_id,code,title,purpose_code,intended_audience) VALUES(survey_id,org,'QA-'||survey_id,'TEST ONLY feedback','course_feedback','learner');
 INSERT INTO public.survey_versions(id,survey_id,version_no,author_person_id,lifecycle) VALUES(sv,survey_id,1,author,'draft');
 INSERT INTO public.survey_questions(survey_version_id,question_key,prompt_text,ordinal,question_type,required,rating_min,rating_max) SELECT sv,'q'||i,'TEST ONLY question '||i,i,'rating',true,1,5 FROM generate_series(1,4) i;
 INSERT INTO public.survey_questions(survey_version_id,question_key,prompt_text,ordinal,question_type,required) VALUES(sv,'q5','TEST ONLY text',5,'text',true);
 FOREACH k IN ARRAY ARRAY['privacy','accessibility','safeguarding'] LOOP
 INSERT INTO public.survey_version_reviews(survey_version_id,review_kind,reviewer_person_id,decision,evidence_version_id) VALUES(sv,k,reviewer,'approved',evidence);
 END LOOP;
 UPDATE public.survey_versions SET lifecycle='published',published_at=now() WHERE id=sv;
 INSERT INTO public.survey_campaigns(id,survey_version_id,operating_organization_id,deployment_id,offering_id,response_mode,status,starts_at,authorized_by_person_id,survey_permission_evidence_id) VALUES(campaign,sv,org,dep,offering,'identified','active',now()-interval '1 hour',reviewer,evidence),(disabled_campaign,sv,org,dep,offering,'identified','active',now()-interval '1 hour',reviewer,evidence),(other_campaign,sv,other_org,dep,offering,'identified','active',now()-interval '1 hour',reviewer,evidence);
 INSERT INTO public.survey_trigger_rules(campaign_id,trigger_kind,enabled) VALUES(campaign,'knowledge_check_submitted',true),(disabled_campaign,'knowledge_check_submitted',false),(other_campaign,'knowledge_check_submitted',true);
 -- Real baseline state transitions must not issue a final feedback invitation.
 SELECT id,learner_id INTO final_grant,learner FROM public.assessment_access_grants WHERE course_attempt_id=ca AND administration_id=baseline_admin;
 SELECT id INTO form_item FROM public.assessment_form_items WHERE form_version_id=baseline_form;
 INSERT INTO public.assessment_attempts(access_grant_id,administration_id,learner_id,form_version_id,attempt_no,state,selection_seed,request_key) VALUES(final_grant,baseline_admin,learner,baseline_form,1,'prepared',1,'qa-baseline-'||ca) RETURNING id INTO attempt;
 INSERT INTO public.assessment_attempt_items(attempt_id,form_version_id,form_item_id,item_version_id,question_number,points_available) VALUES(attempt,baseline_form,form_item,iv,1,1) RETURNING id INTO attempt_item;
 UPDATE public.assessment_attempts SET state='in_progress' WHERE id=attempt;
 INSERT INTO public.assessment_response_versions(attempt_item_id,revision_no,response_state,client_request_id) VALUES(attempt_item,1,'submitted','qa-'||attempt_item) RETURNING id INTO response;
 UPDATE public.assessment_attempts SET state='submitted' WHERE id=attempt;
 INSERT INTO public.assessment_item_scoring_decisions(attempt_item_id,response_version_id,scoring_kind,scoring_engine_version,score) VALUES(attempt_item,response,'automated','can-noncredit-objective-v1',0);
 UPDATE public.assessment_attempts SET state='scored' WHERE id=attempt;
 INSERT INTO public.assessment_attempt_results(attempt_id,result_revision,result_status,points_earned,points_possible,outcome,result_evidence) VALUES(attempt,1,'finalized',0,1,'fail','{"noncreditAutoFinalized":"v1","noncreditPhase":"baseline"}');
 UPDATE public.assessment_attempts SET state='finalized' WHERE id=attempt;
 IF EXISTS(SELECT 1 FROM public.survey_invitations WHERE campaign_id IN(campaign,disabled_campaign,other_campaign)) THEN RAISE EXCEPTION 'Baseline incorrectly invited feedback'; END IF;
 -- Actual database state transitions, not a claim of browser playback or
 -- server scoring: the item response and automated score are synthetic inputs.
 SELECT id,learner_id INTO final_grant,learner FROM public.assessment_access_grants WHERE course_attempt_id=ca AND administration_id=final_admin;
 SELECT id INTO form_item FROM public.assessment_form_items WHERE form_version_id=final_form;
 INSERT INTO public.assessment_attempts(access_grant_id,administration_id,learner_id,form_version_id,attempt_no,state,selection_seed,request_key)
 VALUES(final_grant,final_admin,learner,final_form,1,'prepared',1,'qa-'||ca) RETURNING id INTO attempt;
 INSERT INTO public.assessment_attempt_items(attempt_id,form_version_id,form_item_id,item_version_id,question_number,points_available) VALUES(attempt,final_form,form_item,iv,1,1) RETURNING id INTO attempt_item;
 UPDATE public.assessment_attempts SET state='in_progress' WHERE id=attempt;
 INSERT INTO public.assessment_response_versions(attempt_item_id,revision_no,response_state,client_request_id) VALUES(attempt_item,1,'submitted','qa-'||attempt_item) RETURNING id INTO response;
 INSERT INTO public.assessment_response_choices(response_version_id,attempt_item_id,item_version_id,option_id,answer_position) VALUES(response,attempt_item,iv,option_id,1);
 UPDATE public.assessment_attempts SET state='submitted' WHERE id=attempt;
 INSERT INTO public.assessment_item_scoring_decisions(attempt_item_id,response_version_id,scoring_kind,scoring_engine_version,score) VALUES(attempt_item,response,'automated','can-noncredit-objective-v1',1);
 UPDATE public.assessment_attempts SET state='scored' WHERE id=attempt;
 INSERT INTO public.assessment_attempt_results(attempt_id,result_revision,result_status,points_earned,points_possible,outcome,result_evidence)
 VALUES(attempt,1,'finalized',1,1,'pass','{"noncreditAutoFinalized":"v1","noncreditPhase":"final"}') RETURNING id INTO final_result;
 UPDATE public.assessment_attempts SET state='finalized' WHERE id=attempt;
 SELECT id INTO invitation FROM public.survey_invitations WHERE campaign_id=campaign AND invited_person_id=person_a AND delivery_channel='in_app';
 IF invitation IS NULL OR (SELECT count(*) FROM public.survey_invitations WHERE campaign_id IN(campaign,disabled_campaign,other_campaign))<>1 THEN RAISE EXCEPTION 'Incorrect feedback invitation scope'; END IF;
 PERFORM education_v30.v301_invite_noncredit_knowledge_feedback(attempt);
 IF (SELECT count(*) FROM public.survey_invitations WHERE campaign_id=campaign)<>1 THEN RAISE EXCEPTION 'Duplicate feedback invitation'; END IF;
 INSERT INTO public.survey_responses(campaign_id,survey_version_id,respondent_mode,invitation_id,consent_evidence_version_id) VALUES(campaign,sv,'identified',invitation,evidence) RETURNING id INTO survey_response;
 FOR q IN SELECT id,question_type FROM public.survey_questions WHERE survey_version_id=sv LOOP
 INSERT INTO public.survey_answers(response_id,survey_version_id,question_id,answer_numeric,answer_text) VALUES(survey_response,sv,q.id,CASE WHEN q.question_type='rating' THEN 5 END,CASE WHEN q.question_type='text' THEN 'TEST ONLY feedback' END);
 END LOOP;
 IF (SELECT count(*) FROM public.survey_answers WHERE response_id=survey_response)<>5 THEN RAISE EXCEPTION 'Incomplete feedback responses'; END IF;
 BEGIN
 INSERT INTO public.survey_responses(campaign_id,survey_version_id,respondent_mode,invitation_id) VALUES(campaign,sv,'identified',invitation);
 RAISE EXCEPTION 'Duplicate survey response allowed';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.noncredit_completion_decisions WHERE registration_id=reg) THEN RAISE EXCEPTION 'Assessment alone must not complete training'; END IF;
 FOR lesson IN SELECT id,lesson_order FROM public.course_lessons WHERE course_version_id=cv ORDER BY lesson_order LOOP
 INSERT INTO public.learner_lesson_progress(course_attempt_id,course_version_id,lesson_id,status) VALUES(ca,cv,lesson.id,'completed');
 IF lesson.lesson_order<7 AND EXISTS(SELECT 1 FROM public.noncredit_completion_decisions WHERE registration_id=reg) THEN RAISE EXCEPTION 'Completion before all seven lessons'; END IF;
 END LOOP;
 SELECT id INTO completion_id FROM public.noncredit_completion_decisions WHERE registration_id=reg AND policy_id=pol AND assessment_result_id=final_result AND decision_source='automatic' AND outcome='completed';
 IF completion_id IS NULL THEN RAISE EXCEPTION 'Final lesson did not trigger governed completion'; END IF;
 PERFORM education_v30.v301_try_auto_complete_noncredit(reg);
 IF (SELECT count(*) FROM public.noncredit_completion_decisions WHERE registration_id=reg)<>1 THEN RAISE EXCEPTION 'Duplicate completion'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_events WHERE resource_id=completion_id AND action='noncredit.completion.automatic') OR NOT EXISTS(SELECT 1 FROM public.domain_events WHERE aggregate_id=completion_id AND event_type='NoncreditTrainingCompleted') THEN RAISE EXCEPTION 'Missing completion audit/domain event'; END IF;
 -- Another eligible administration makes the final phase ambiguous. A fresh
 -- learner may receive the single baseline grant, but never a guessed final.
 INSERT INTO public.assessment_administrations(administering_organization_id,assessment_version_id,form_version_id,operation_id,deployment_id,course_version_id,administration_code,status,proctor_policy) VALUES(org,final,final_form,op,dep,cv,'QA-duplicate-'||dep,'open','none');
 INSERT INTO public.noncredit_registrations(deployment_id,training_version_id,adoption_id,offering_version_id,participant_person_id,registering_organization_id,status) VALUES(dep,training,adoption,ov,person_b,org,'registered') RETURNING id INTO reg_b;
 INSERT INTO public.learner_course_attempts(noncredit_registration_id,deployment_id,adoption_id,offering_version_id,course_version_id,attempt_no,status) VALUES(reg_b,dep,adoption,ov,cv,1,'active') RETURNING id INTO ca_b;
 IF (SELECT count(*) FROM public.assessment_access_grants WHERE course_attempt_id=ca_b)<>1 OR NOT EXISTS(SELECT 1 FROM public.assessment_access_grants WHERE course_attempt_id=ca_b AND administration_id=baseline_admin) THEN RAISE EXCEPTION 'Ambiguous final assessment must fail closed'; END IF;
 IF EXISTS(SELECT 1 FROM public.assessment_access_grants a JOIN public.assessment_access_grants x ON a.learner_id=x.learner_id WHERE a.course_attempt_id=ca AND x.course_attempt_id=ca_b) THEN RAISE EXCEPTION 'Cross-learner grant'; END IF;
 results:=jsonb_build_object('assessment_grants',n,'repeat_idempotent',true,'learner_and_policy_pinned',true,'no_premature_completion',true,'ambiguous_final_denied',true,'distinct_learner_grants',true,'assessment_alone_not_completion',true,'seven_lessons_required',true,'automatic_completion_once',true,'completion_audit_and_domain_event',true,'baseline_no_feedback',true,'final_feedback_exact_scope',true,'feedback_invitation_idempotent',true,'five_feedback_answers',true,'duplicate_feedback_denied',true);
 RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='QA rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN INSERT INTO pg_temp.pilot_qa_result VALUES(results);
 END;
 IF EXISTS(SELECT 1 FROM public.organizations WHERE id=org) OR EXISTS(SELECT 1 FROM public.people WHERE id IN(author,reviewer,person_a,person_b)) OR EXISTS(SELECT 1 FROM public.learner_course_attempts WHERE id IN(ca,ca_b)) THEN RAISE EXCEPTION 'Synthetic fixture was not rolled back'; END IF;
END $qa$;
