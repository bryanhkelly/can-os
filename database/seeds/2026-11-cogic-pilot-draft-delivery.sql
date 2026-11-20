-- Reusable draft-only delivery scaffolding for two existing CAN pilot Offerings.
-- Never grants review, enrollment, School authority, content rights, assessment
-- publication, survey invitations, completion, attendance or COGIC affiliation.
-- Uses EXISTING synthetic CAN demo author as seed provenance, not a partner.
-- AI required instruction minutes remain 0 until the approved schedule is known.
-- Content and grading prompts are explicitly marked DRAFT and need instructor review.
-- Requires public.* canonical pilot catalog from 2026-11-cogic-reusable-pilot-catalog.sql.
-- All work in one guarded transaction and idempotent on unique canonical keys.
BEGIN;
-- Step 1
DO $gate$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.people
    WHERE id='c833d79e-72e0-4822-8bd4-9174e33feec2'::uuid AND active AND metadata->>'synthetic'='true')
  OR NOT EXISTS (SELECT 1 FROM public.organizations
    WHERE id='ca270000-0000-4000-8000-000000000001'::uuid AND name='CAN Community Learning Center (Demo)')
  THEN RAISE EXCEPTION 'CAN demo publisher and synthetic author must be verified'; END IF;
  IF (SELECT count(*) FROM public.offerings o
      JOIN public.offering_versions v ON v.offering_id=o.id
      WHERE o.publisher_organization_id='ca270000-0000-4000-8000-000000000001' AND
      o.code IN ('CLC-CUSTOM-TRAINING-01','CLC-DIGITAL-01')
      AND v.lifecycle='draft')<>2
  THEN RAISE EXCEPTION 'Both canonical pilot Offerings must remain draft'; END IF;
END $gate$;

-- Step 2
INSERT INTO public.noncredit_training_versions
 (offering_version_id,provider_organization_id,title,required_instruction_minutes,
  state,author_person_id)
 SELECT v.id,o.publisher_organization_id,
   CASE o.code WHEN 'CLC-CUSTOM-TRAINING-01' THEN 'Custom Training Pilot · Draft'
               ELSE 'AI & Digital Skills Pilot · Draft' END,
   CASE o.code WHEN 'CLC-CUSTOM-TRAINING-01' THEN 60 ELSE 0 END,
   'draft','c833d79e-72e0-4822-8bd4-9174e33feec2'::uuid
 FROM public.offering_versions v JOIN public.offerings o ON o.id=v.offering_id
 WHERE o.publisher_organization_id='ca270000-0000-4000-8000-000000000001'
 AND o.code IN ('CLC-CUSTOM-TRAINING-01','CLC-DIGITAL-01')
 AND v.lifecycle='draft'
 ON CONFLICT (offering_version_id) DO NOTHING;

-- Step 3
INSERT INTO public.assessment_definitions
 (owner_organization_id,assessment_key,title,purpose,course_id)
 SELECT c.publisher_organization_id,
  CASE c.course_code WHEN 'CLC-CUSTOM-TRAINING-01'
    THEN 'pilot.custom_training.knowledge_check'
    ELSE 'pilot.ai_digital_skills.knowledge_check' END,
  CASE c.course_code WHEN 'CLC-CUSTOM-TRAINING-01'
    THEN 'Custom Training · Five-Question Draft Knowledge Check'
    ELSE 'AI & Digital Skills · Five-Question Draft Knowledge Check' END,
  'formative',c.id
 FROM public.courses c WHERE c.publisher_organization_id='ca270000-0000-4000-8000-000000000001'
 AND c.course_code IN ('CLC-CUSTOM-TRAINING-01','CLC-AI-DIGITAL-01')
 ON CONFLICT (owner_organization_id,assessment_key) DO NOTHING;

-- Step 4
INSERT INTO public.assessment_versions
 (assessment_id,course_version_id,assessment_key,version_no,blueprint,lifecycle)
 SELECT d.id,cv.id,d.assessment_key,1,
 '{"synthetic":true,"pilotDraft":true,"assessmentReview":"required","scoringReview":"required","authorSource":"CAN demo","notAuthorizedForLearners":true}'::jsonb,
 'draft'
 FROM public.assessment_definitions d
 JOIN public.course_versions cv ON cv.course_id=d.course_id AND cv.version_no=1 AND cv.lifecycle='draft'
 WHERE d.owner_organization_id='ca270000-0000-4000-8000-000000000001'
 AND d.assessment_key IN ('pilot.custom_training.knowledge_check','pilot.ai_digital_skills.knowledge_check')
 ON CONFLICT (assessment_id,version_no) DO NOTHING;

-- Step 5
INSERT INTO public.assessment_forms(assessment_id,form_key,title)
 SELECT d.id,'five-question-draft','Five draft knowledge-check items (subject to review)'
 FROM public.assessment_definitions d
 WHERE d.owner_organization_id='ca270000-0000-4000-8000-000000000001' AND
 d.assessment_key IN ('pilot.custom_training.knowledge_check','pilot.ai_digital_skills.knowledge_check')
 ON CONFLICT (assessment_id,form_key) DO NOTHING;

-- Step 6
INSERT INTO public.assessment_form_versions
 (form_id,assessment_id,assessment_version_id,version_no,lifecycle)
 SELECT f.id,d.id,v.id,1,'draft' FROM public.assessment_forms f
 JOIN public.assessment_definitions d ON d.id=f.assessment_id
 JOIN public.assessment_versions v ON v.assessment_id=d.id AND v.version_no=1 AND v.lifecycle='draft'
 WHERE d.owner_organization_id='ca270000-0000-4000-8000-000000000001' AND f.form_key='five-question-draft'
 AND d.assessment_key IN ('pilot.custom_training.knowledge_check','pilot.ai_digital_skills.knowledge_check')
 ON CONFLICT (form_id,version_no) DO NOTHING;

-- Step 7
INSERT INTO public.assessment_form_sections
 (form_version_id,section_key,title,ordinal,selection_mode)
 SELECT fv.id,'knowledge-check','Five questions · awaiting instructor approval',1,'fixed'
 FROM public.assessment_form_versions fv
 JOIN public.assessment_forms f ON f.id=fv.form_id
 JOIN public.assessment_definitions d ON d.id=f.assessment_id
 WHERE d.owner_organization_id='ca270000-0000-4000-8000-000000000001' AND f.form_key='five-question-draft' AND fv.version_no=1
 AND d.assessment_key IN ('pilot.custom_training.knowledge_check','pilot.ai_digital_skills.knowledge_check')
 ON CONFLICT DO NOTHING;

-- Step 8
INSERT INTO public.assessment_item_banks
 (owner_organization_id,bank_code,title,scope_kind)
 VALUES
 ('ca270000-0000-4000-8000-000000000001','pilot.custom_training.question_bank','Custom Training draft questions','course'),
 ('ca270000-0000-4000-8000-000000000001','pilot.ai_digital_skills.question_bank','AI & Digital Skills draft questions','course')
 ON CONFLICT (owner_organization_id,bank_code) DO NOTHING;

-- Step 9
INSERT INTO public.assessment_items(bank_id,item_key,title,created_by_person_id)
 SELECT bank.id,'q'||q.num,'Draft knowledge check question '||q.num,'c833d79e-72e0-4822-8bd4-9174e33feec2'::uuid
 FROM public.assessment_item_banks bank CROSS JOIN generate_series(1,5) AS q(num)
 WHERE bank.owner_organization_id='ca270000-0000-4000-8000-000000000001' AND bank.bank_code IN
 ('pilot.custom_training.question_bank','pilot.ai_digital_skills.question_bank')
 ON CONFLICT (bank_id,item_key) DO NOTHING;

-- Step 10
INSERT INTO public.assessment_item_versions
 (item_id,version_no,response_kind,item_prompt,response_schema,rubric_public,maximum_points,lifecycle)
 SELECT item.id,1,'short_text',
 jsonb_build_object('text',
  CASE WHEN bank.bank_code='pilot.custom_training.question_bank'
    THEN 'DRAFT: Explain one concept from training module '||substring(item.item_key from 2)||'. Instructor must replace and validate against approved media.'
    ELSE (ARRAY[
      'What should never be included in a prompt to a public AI service?',
      'How could you independently verify a claim generated by an AI tool?',
      'What signs might indicate a phishing or impersonation attempt?',
      'How can you responsibly use AI to address a local community problem?',
      'What should you do if an AI-generated citation cannot be found?'
    ])[substring(item.item_key from 2)::integer] END,
   'reviewStatus','instructor_review_required','synthetic',true),
 '{"type":"string","reviewRequired":true}'::jsonb,
 '{"manualScoringReviewRequired":true,"draftOnly":true}'::jsonb,1,'draft'
 FROM public.assessment_items item
 JOIN public.assessment_item_banks bank ON bank.id=item.bank_id
 WHERE bank.owner_organization_id='ca270000-0000-4000-8000-000000000001' AND bank.bank_code IN
 ('pilot.custom_training.question_bank','pilot.ai_digital_skills.question_bank')
 AND item.item_key~'^q[1-5]$'
 ON CONFLICT (item_id,version_no) DO NOTHING;

-- Step 11
INSERT INTO public.assessment_form_items
 (form_version_id,form_section_id,item_version_id,position)
 SELECT fv.id,section.id,iv.id,substring(item.item_key from 2)::integer
 FROM public.assessment_form_versions fv
 JOIN public.assessment_forms f ON f.id=fv.form_id
 JOIN public.assessment_definitions d ON d.id=f.assessment_id
 JOIN public.assessment_form_sections section ON section.form_version_id=fv.id AND section.section_key='knowledge-check'
 JOIN public.assessment_item_banks bank ON bank.owner_organization_id=d.owner_organization_id AND
 bank.bank_code=CASE d.assessment_key WHEN 'pilot.custom_training.knowledge_check'
 THEN 'pilot.custom_training.question_bank' ELSE 'pilot.ai_digital_skills.question_bank' END
 JOIN public.assessment_items item ON item.bank_id=bank.id
 JOIN public.assessment_item_versions iv ON iv.item_id=item.id AND iv.version_no=1 AND iv.lifecycle='draft'
 WHERE d.owner_organization_id='ca270000-0000-4000-8000-000000000001' AND d.assessment_key IN
 ('pilot.custom_training.knowledge_check','pilot.ai_digital_skills.knowledge_check')
 AND fv.version_no=1 AND item.item_key~'^q[1-5]$'
 AND NOT EXISTS (SELECT 1 FROM public.assessment_form_items existing
  WHERE existing.form_version_id=fv.id AND existing.position=substring(item.item_key from 2)::integer);

-- Step 12
UPDATE public.noncredit_training_versions training
 SET assessment_version_id=v.id
 FROM public.offering_versions ov JOIN public.offerings o ON o.id=ov.offering_id
 JOIN public.offering_courses oc ON oc.offering_version_id=ov.id
 JOIN public.assessment_versions v ON v.course_version_id=oc.course_version_id AND v.version_no=1
 JOIN public.assessment_definitions def ON def.id=v.assessment_id
 WHERE training.offering_version_id=ov.id AND training.state='draft'
 AND training.assessment_version_id IS NULL
 AND o.publisher_organization_id='ca270000-0000-4000-8000-000000000001'
 AND ((o.code='CLC-CUSTOM-TRAINING-01' AND def.assessment_key='pilot.custom_training.knowledge_check')
 OR (o.code='CLC-DIGITAL-01' AND def.assessment_key='pilot.ai_digital_skills.knowledge_check'));

-- Step 13
INSERT INTO public.survey_definitions
 (owner_organization_id,code,title,purpose_code,intended_audience)
 VALUES
 ('ca270000-0000-4000-8000-000000000001','pilot.custom_training.feedback','Custom Training Pilot · Draft Feedback','course_feedback','learner'),
 ('ca270000-0000-4000-8000-000000000001','pilot.ai_digital_skills.feedback','AI & Digital Skills Pilot · Draft Feedback','course_feedback','learner')
 ON CONFLICT (owner_organization_id,code) DO NOTHING;

-- Step 14
INSERT INTO public.survey_versions
 (survey_id,version_no,locale,author_person_id,lifecycle)
 SELECT id,1,'en-US','c833d79e-72e0-4822-8bd4-9174e33feec2'::uuid,'draft'
 FROM public.survey_definitions WHERE owner_organization_id='ca270000-0000-4000-8000-000000000001'
 AND code IN ('pilot.custom_training.feedback','pilot.ai_digital_skills.feedback')
 ON CONFLICT (survey_id,version_no,locale) DO NOTHING;

-- Step 15
INSERT INTO public.survey_questions
 (survey_version_id,question_key,prompt_text,ordinal,question_type,required,rating_min,rating_max)
 SELECT v.id,'q'||q.num,q.prompt,q.num,
 CASE WHEN q.num<=3 THEN 'rating' ELSE 'text' END,
 q.num<=3,
 CASE WHEN q.num<=3 THEN 1 ELSE NULL END,
 CASE WHEN q.num<=3 THEN 5 ELSE NULL END
 FROM public.survey_versions v JOIN public.survey_definitions d ON d.id=v.survey_id
 CROSS JOIN (VALUES
   (1,'DRAFT: How clearly were the learning goals explained?'),
   (2,'DRAFT: How useful was the training for your work or learning?'),
   (3,'DRAFT: How confident do you feel applying what you learned?'),
   (4,'DRAFT: Which topic needs additional explanation?'),
   (5,'DRAFT: What would you improve for a future session?')
 ) q(num,prompt)
 WHERE d.owner_organization_id='ca270000-0000-4000-8000-000000000001'
 AND d.code IN ('pilot.custom_training.feedback','pilot.ai_digital_skills.feedback')
 AND v.version_no=1 AND v.lifecycle='draft'
 ON CONFLICT (survey_version_id,question_key) DO NOTHING;

-- Step 16
DO $verify$
DECLARE draft_count integer; form_count integer; survey_count integer;
BEGIN
 SELECT count(*) INTO draft_count FROM public.noncredit_training_versions t
 JOIN public.offering_versions ov ON ov.id=t.offering_version_id
 JOIN public.offerings o ON o.id=ov.offering_id
 WHERE o.code IN ('CLC-CUSTOM-TRAINING-01','CLC-DIGITAL-01')
 AND t.provider_organization_id='ca270000-0000-4000-8000-000000000001' AND t.state='draft'
 AND t.published_at IS NULL AND t.approved_by_person_id IS NULL
 AND t.assessment_version_id IS NOT NULL;
 SELECT count(*) INTO form_count FROM public.assessment_form_items i
 JOIN public.assessment_form_versions fv ON fv.id=i.form_version_id
 JOIN public.assessment_forms f ON f.id=fv.form_id
 JOIN public.assessment_definitions d ON d.id=f.assessment_id
 WHERE d.owner_organization_id='ca270000-0000-4000-8000-000000000001'
 AND d.assessment_key IN ('pilot.custom_training.knowledge_check','pilot.ai_digital_skills.knowledge_check');
 SELECT count(*) INTO survey_count FROM public.survey_questions q
 JOIN public.survey_versions sv ON sv.id=q.survey_version_id
 JOIN public.survey_definitions d ON d.id=sv.survey_id
 WHERE d.owner_organization_id='ca270000-0000-4000-8000-000000000001'
 AND d.code IN ('pilot.custom_training.feedback','pilot.ai_digital_skills.feedback');
 IF draft_count<>2 OR form_count<>10 OR survey_count<>10
 THEN RAISE EXCEPTION 'Pilot draft counts invalid: training %, assessment questions %, feedback questions %', draft_count,form_count,survey_count; END IF;
END $verify$;
COMMIT;
