-- Valor V6.1 Phase 5: canonical formative assessment authoring examples.
-- 12 Course-specific draft Formative Assessments, three short-response items each.
-- No assessment is published, scheduled, administered, scored, or made available
-- to minor learners: independent content, accessibility and scoring review pending.
-- Uses ONLY canonical Courses, Course Versions, assessment, form and item tables.
DO $valor_demo_assessments$
DECLARE
 v_site CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
 v_org CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
 v_riley CONSTANT uuid:='f1000000-0000-4000-8000-000000000006';
 rec record;
 n integer;
 assessment_id uuid;
 assessment_version_id uuid;
 bank_id uuid;
 form_id uuid;
 form_version_id uuid;
 section_id uuid;
 item_id uuid;
 item_version_id uuid;
 question text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=v_site AND organization_id=v_org
    AND metadata @> '{"synthetic":true}'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM public.people WHERE id=v_riley AND metadata @> '{"synthetic":true}'::jsonb)
 THEN RAISE EXCEPTION 'Valor synthetic Site or teacher identity unavailable'; END IF;
 IF (SELECT count(*) FROM public.classes WHERE site_id=v_site
   AND deployment_id=md5('valor-v61:deployment')::uuid)<>12 THEN
   RAISE EXCEPTION 'Valor Class inventory mismatch'; END IF;

 FOR rec IN
  SELECT c.id course_id,c.course_code,c.title,c.subject,cv.id course_version_id
  FROM public.courses c JOIN public.course_versions cv ON cv.course_id=c.id
  JOIN public.classes cls ON cls.course_version_id=cv.id AND cls.site_id=v_site
  WHERE c.publisher_organization_id=v_org
    AND cv.syllabus->>'source'='valor-2026-original-curriculum'
  ORDER BY c.course_code
 LOOP
  assessment_id:=md5('valor-v61:assessment:'||rec.course_code)::uuid;
  assessment_version_id:=md5('valor-v61:assessment-version:'||rec.course_code)::uuid;
  form_id:=md5('valor-v61:assessment-form:'||rec.course_code)::uuid;
  form_version_id:=md5('valor-v61:assessment-form-version:'||rec.course_code)::uuid;
  section_id:=md5('valor-v61:assessment-form-section:'||rec.course_code)::uuid;
  bank_id:=md5('valor-v61:assessment-bank:'||rec.course_code)::uuid;

  INSERT INTO public.assessment_definitions
   (id,owner_organization_id,assessment_key,title,purpose,course_id,status)
  VALUES(assessment_id,v_org,'valor.demo.'||lower(rec.course_code)||'.knowledge_check',
    rec.title||' · Synthetic Practice Check','formative',rec.course_id,'active')
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.assessment_versions
   (id,assessment_id,course_version_id,assessment_key,version_no,blueprint,lifecycle)
  VALUES(assessment_version_id,assessment_id,rec.course_version_id,
    'valor.demo.'||lower(rec.course_code)||'.knowledge_check',1,
    jsonb_build_object('synthetic',true,'fixture','valor-v61-full-demo',
      'reviewRequired',true,'notAuthorizedForLearners',true,
      'kind','teacher-authored-short-response',
      'scoring','manual_demo_review_only'),'draft')
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.assessment_forms(id,assessment_id,form_key,title)
  VALUES(form_id,assessment_id,'synthetic-3-question-draft',
    rec.title||' · Three-Question Draft Practice')
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.assessment_form_versions
    (id,form_id,assessment_id,assessment_version_id,version_no,
     lifecycle,scoring_policy,shuffle_questions)
  VALUES(form_version_id,form_id,assessment_id,assessment_version_id,1,
    'draft','{"synthetic":true,"manualReviewRequired":true,"noOfficialGrading":true}'::jsonb,
    false)
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.assessment_form_sections
   (id,form_version_id,section_key,title,ordinal,selection_mode)
  VALUES(section_id,form_version_id,'practice-draft','Review-pending practice',1,'fixed')
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.assessment_item_banks
   (id,owner_organization_id,bank_code,title,scope_kind,status)
  VALUES(bank_id,v_org,'valor.demo.'||lower(rec.course_code)||'.bank',
    rec.title||' · Synthetic Draft Items','course','active')
  ON CONFLICT(id) DO NOTHING;

  FOR n IN 1..3 LOOP
   question:=CASE rec.course_code
    WHEN 'CAN-ALG1' THEN (ARRAY[
     'Explain how to tell whether two algebraic expressions are equivalent. Give an example.',
     'Solve 2x + 3 = 11 and explain why each operation preserves equality.',
     'Describe what slope tells you about a straight-line relationship.'
    ])[n]
    WHEN 'ALG-S' THEN (ARRAY[
     'Explain how a quadratic expression differs from a linear expression.',
     'Describe one situation where a function is useful for modeling a real problem.',
     'Explain a strategy for checking a solution to an algebraic equation.'
    ])[n]
    WHEN 'CAN-BIO' THEN (ARRAY[
     'Give a testable biological question and identify its independent and dependent variables.',
     'Compare one important feature of prokaryotic and eukaryotic cells.',
     'Explain why a control group helps interpret biological evidence.'
    ])[n]
    WHEN 'BIO-S' THEN (ARRAY[
     'Describe a characteristic shared by living organisms.',
     'What is one practical way to observe cells safely in a classroom?',
     'Explain the difference between observation and inference in biology.'
    ])[n]
    WHEN 'CAN-ENG9' THEN (ARRAY[
     'Explain the difference between observing a detail in a text and interpreting it.',
     'How does a character choice reveal a conflict? Use a fictional example.',
     'Describe how textual evidence can support more than one interpretation.'
    ])[n]
    WHEN 'ENG-CR-01' THEN (ARRAY[
     'Describe one concrete detail you notice before interpreting a passage.',
     'Form a claim based on a textual detail and explain the connection.',
     'What alternative interpretation of the same textual evidence might be plausible?'
    ])[n]
    WHEN 'ENG-S' THEN (ARRAY[
     'What makes a theme different from the events in a plot?',
     'How can setting influence the choices a fictional character makes?',
     'Write a short analytical claim and identify one piece of supporting evidence.'
    ])[n]
    WHEN 'CAN-USHIST' THEN (ARRAY[
     'Identify two types of sources that might help reconstruct early North American history.',
     'Explain why geographical context matters when studying historical trade routes.',
     'What questions would help evaluate the perspective of a historical document?'
    ])[n]
    WHEN 'HIS-S' THEN (ARRAY[
     'Explain why historians distinguish primary and secondary sources.',
     'Describe how geography can influence a civilization.',
     'How can two historians arrive at different interpretations of the same event?'
    ])[n]
    WHEN 'SPAN-S' THEN (ARRAY[
     'Introduce yourself in a complete Spanish sentence and give an English translation.',
     'Write a simple Spanish greeting appropriate for a classmate.',
     'Explain how practicing pronunciation supports Spanish comprehension.'
    ])[n]
    WHEN 'PHOTO-S' THEN (ARRAY[
     'Describe how composition can draw attention to a subject in a photograph.',
     'What happens to an image when lighting direction changes?',
     'Explain one ethical consideration when photographing other people.'
    ])[n]
    ELSE (ARRAY[
     'Identify one academic goal you can complete this week.',
     'Describe how you would organize your learning activities across several classes.',
     'Explain when you should ask a teacher or trusted adult for help with your learning.'
    ])[n]
   END;
   item_id:=md5('valor-v61:assessment-item:'||rec.course_code||':'||n)::uuid;
   item_version_id:=md5('valor-v61:assessment-item-version:'||rec.course_code||':'||n)::uuid;
   INSERT INTO public.assessment_items
    (id,bank_id,item_key,title,created_by_person_id,status)
   VALUES(item_id,bank_id,'question-'||n,'Draft question '||n,v_riley,'active')
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.assessment_item_versions
    (id,item_id,version_no,response_kind,item_prompt,response_schema,
     rubric_public,maximum_points,lifecycle)
   VALUES(item_version_id,item_id,1,'short_text',
     jsonb_build_object('text',question,'synthetic',true,'reviewRequired',true),
     '{"type":"string","minLength":10,"maxLength":1500}'::jsonb,
     '{"manualReviewRequired":true,"notAnOfficialGrade":true}'::jsonb,1,
     'draft')
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.assessment_form_items
    (id,form_version_id,form_section_id,item_version_id,position)
   VALUES(md5('valor-v61:assessment-form-item:'||rec.course_code||':'||n)::uuid,
     form_version_id,section_id,item_version_id,n)
   ON CONFLICT(id) DO NOTHING;
  END LOOP;
 END LOOP;

 IF (SELECT count(*) FROM public.assessment_versions
      WHERE id IN(SELECT md5('valor-v61:assessment-version:'||c.course_code)::uuid
        FROM public.courses c JOIN public.classes cls ON cls.course_version_id IN
         (SELECT cv.id FROM public.course_versions cv WHERE cv.course_id=c.id)
        WHERE cls.site_id=v_site AND c.publisher_organization_id=v_org)
      AND lifecycle='draft')<>12
  OR (SELECT count(*) FROM public.assessment_form_items afi
      JOIN public.assessment_form_versions afv ON afv.id=afi.form_version_id
      WHERE afv.id IN(SELECT md5('valor-v61:assessment-form-version:'||c.course_code)::uuid
        FROM public.courses c JOIN public.course_versions cv ON cv.course_id=c.id
        JOIN public.classes cls ON cls.course_version_id=cv.id
        WHERE cls.site_id=v_site AND c.publisher_organization_id=v_org))<>36
 THEN RAISE EXCEPTION 'Valor draft assessment fixture incomplete'; END IF;
END $valor_demo_assessments$;
