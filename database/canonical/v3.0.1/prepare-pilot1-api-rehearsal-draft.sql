-- Reusable isolated QA draft, never real partner approval or live enrollment.
DO $qa$
DECLARE
 org uuid:=gen_random_uuid(); author uuid:=gen_random_uuid(); site uuid:=gen_random_uuid();
 operation uuid:=gen_random_uuid(); offering uuid:=gen_random_uuid(); ov uuid:=gen_random_uuid();
 course uuid:=gen_random_uuid(); cv uuid:=gen_random_uuid(); unit_id uuid:=gen_random_uuid();
 deployment uuid:=gen_random_uuid(); bank uuid:=gen_random_uuid(); item uuid; iv uuid;
 item_ids uuid[]:=ARRAY[]::uuid[]; adf uuid; av uuid; frm uuid; fv uuid; sect uuid;
 baseline uuid; final_id uuid; training uuid:=gen_random_uuid(); survey_id uuid:=gen_random_uuid(); sv uuid:=gen_random_uuid();
 phase text; q record; i int; j int; branch_id text:=current_setting('neon.branch_id',true);
 fixture_key text:='pilot1-api-rehearsal-v1';
 title text:='Community Decision-Making: QA Rehearsal';
 lesson_titles text[]:=ARRAY['Welcome to the rehearsal','Define the decision','Gather useful evidence','Check the evidence','Compare the options','Measure what happened','Review and next steps'];
 questions jsonb:='[{"prompt":"What should you do before collecting information?","options":["Define the decision","Choose a result in advance","Collect every possible fact"]},{"prompt":"Which evidence helps choose a meeting time?","options":["A random article","Participants’ availability","The number of posters printed"]},{"prompt":"What should you do when important information is missing?","options":["Assume the answer","Ignore the gap","Identify the gap and seek evidence"]},{"prompt":"How should you compare realistic options?","options":["Use consistent criteria","Change the criteria for each option","Choose the first option"]},{"prompt":"Which best measures actual participation?","options":["Number of invitations sent","Verified participation records","Number of promotional messages"]}]';
 feedback text[]:=ARRAY['The lessons were clear.','The recorded lesson player was easy to use.','The knowledge checks were easy to navigate.','The learning experience was useful.','What should we improve?'];
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
 OR branch_id IS DISTINCT FROM current_setting('can.qa_expected_branch',true)
 OR coalesce(branch_id,'') IN ('','br-restless-sea-ar9ooo55','br-bitter-feather-ar0u63x7')
 THEN RAISE EXCEPTION 'Dedicated nonproduction QA branch required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('qa-draft:'||fixture_key));
 IF EXISTS(SELECT 1 FROM public.organizations o WHERE o.metadata->>'qa_fixture_key'=fixture_key AND o.metadata->>'intended_branch'=branch_id) THEN
  RAISE NOTICE 'QA draft already exists; no mutation';
  RETURN;
 END IF;
 INSERT INTO public.organizations(id,type,name,slug,metadata,lifecycle_status)
 VALUES(org,'other_partner','TEST ONLY - Pilot API rehearsal','pilot-api-qa-'||org,jsonb_build_object('qa_only',true,'intended_branch',branch_id,'qa_fixture_key',fixture_key),'active');
 INSERT INTO public.people(id,legal_first_name,legal_last_name,metadata)
 VALUES(author,'TEST','ONLY rehearsal author',jsonb_build_object('qa_only',true,'intended_branch',branch_id,'qa_fixture_key',fixture_key));
 INSERT INTO public.sites(id,organization_id,name,slug,site_kind,lifecycle_status)
 VALUES(site,org,'TEST ONLY rehearsal Site','pilot-api-qa-'||site,'virtual','planning');
 INSERT INTO public.education_operations(id,code,name,kind_code,status) VALUES(operation,'QA-'||operation,'TEST ONLY rehearsal operation','learning_center','planning');
 INSERT INTO public.offerings(id,publisher_organization_id,code,title,status) VALUES(offering,org,'QA-'||offering,title,'active');
 INSERT INTO public.offering_versions(id,offering_id,version_no,lifecycle) VALUES(ov,offering,1,'draft');
 INSERT INTO public.courses(id,publisher_organization_id,course_code,title,subject) VALUES(course,org,'QA-'||course,title,'QA');
 INSERT INTO public.course_versions(id,course_id,version_no,lifecycle) VALUES(cv,course,1,'draft');
 INSERT INTO public.course_units(id,course_version_id,unit_key,title,sequence_no) VALUES(unit_id,cv,'qa','Community decision-making',1);
 FOR i IN 1..7 LOOP
 INSERT INTO public.course_lessons(course_version_id,course_unit_id,lesson_key,title,lesson_order,content)
 VALUES(cv,unit_id,'lesson-'||i,lesson_titles[i],i,jsonb_build_object('qaOnly',true,'mediaStatus','not_uploaded','rehearsalMediaFile',lpad(i::text,2,'0')||'.mp4','captionFile',lpad(i::text,2,'0')||'.vtt'));
 END LOOP;
 INSERT INTO public.offering_courses(offering_version_id,course_version_id,is_required,sequence_no) VALUES(ov,cv,true,1);
 INSERT INTO public.offering_release_requirements(offering_version_id,course_version_id,minimum_approved_primary_tracks,complete_lesson_coverage_required,independent_academic_review_required,rights_clearance_required,accessibility_review_required)
 VALUES(ov,cv,1,true,true,true,true);
 INSERT INTO public.program_deployments(id,operation_id,offering_id,code,name,status) VALUES(deployment,operation,offering,'QA-'||deployment,'TEST ONLY rehearsal deployment','planning');
 INSERT INTO public.assessment_item_banks(id,owner_organization_id,bank_code,title) VALUES(bank,org,'QA-'||bank,'QA rehearsal objective questions');
 FOR i IN 1..5 LOOP
  item:=gen_random_uuid();iv:=gen_random_uuid();
  INSERT INTO public.assessment_items(id,bank_id,item_key,title,created_by_person_id) VALUES(item,bank,'qa-item-'||i,questions->(i-1)->>'prompt',author);
  INSERT INTO public.assessment_item_versions(id,item_id,version_no,response_kind,item_prompt,maximum_points,lifecycle) VALUES(iv,item,1,'single_select',jsonb_build_object('text',questions->(i-1)->>'prompt'),1,'draft');
  FOR j IN 1..3 LOOP
   INSERT INTO public.assessment_item_options(item_version_id,option_key,ordinal,display_content) VALUES(iv,'option-'||j,j,jsonb_build_object('text',questions->(i-1)->'options'->>(j-1)));
  END LOOP;
  item_ids:=array_append(item_ids,iv);
 END LOOP;
 FOREACH phase IN ARRAY ARRAY['diagnostic','formative'] LOOP
  adf:=gen_random_uuid();av:=gen_random_uuid();frm:=gen_random_uuid();fv:=gen_random_uuid();sect:=gen_random_uuid();
  INSERT INTO public.assessment_definitions(id,owner_organization_id,assessment_key,title,purpose,course_id) VALUES(adf,org,'QA-'||adf,CASE WHEN phase='diagnostic' THEN 'QA baseline' ELSE 'QA final' END,phase,course);
  INSERT INTO public.assessment_versions(id,assessment_id,course_version_id,assessment_key,version_no,lifecycle) VALUES(av,adf,cv,'QA-'||av,1,'draft');
  INSERT INTO public.assessment_forms(id,assessment_id,form_key,title) VALUES(frm,adf,'qa','QA rehearsal form');
  INSERT INTO public.assessment_form_versions(id,form_id,assessment_id,assessment_version_id,version_no,lifecycle) VALUES(fv,frm,adf,av,1,'draft');
  INSERT INTO public.assessment_form_sections(id,form_version_id,section_key,title,ordinal) VALUES(sect,fv,'qa','QA rehearsal questions',1);
  FOR i IN 1..5 LOOP
   INSERT INTO public.assessment_form_items(form_version_id,form_section_id,item_version_id,position) VALUES(fv,sect,item_ids[i],i);
  END LOOP;
  IF phase='diagnostic' THEN baseline:=av; ELSE final_id:=av; END IF;
 END LOOP;
 INSERT INTO public.noncredit_training_versions(id,offering_version_id,provider_organization_id,title,required_instruction_minutes,state,author_person_id,assessment_version_id,baseline_assessment_version_id)
 VALUES(training,ov,org,title,0,'draft',author,final_id,baseline);
 INSERT INTO public.survey_definitions(id,owner_organization_id,code,title,purpose_code,intended_audience) VALUES(survey_id,org,'QA-'||survey_id,'QA rehearsal feedback','course_feedback','learner');
 INSERT INTO public.survey_versions(id,survey_id,version_no,author_person_id,lifecycle) VALUES(sv,survey_id,1,author,'draft');
 FOR i IN 1..5 LOOP
  INSERT INTO public.survey_questions(survey_version_id,question_key,prompt_text,ordinal,question_type,required,rating_min,rating_max)
  VALUES(sv,'q'||i,feedback[i],i,CASE WHEN i=5 THEN 'text' ELSE 'rating' END,true,CASE WHEN i<5 THEN 1 END,CASE WHEN i<5 THEN 5 END);
 END LOOP;
END $qa$;
