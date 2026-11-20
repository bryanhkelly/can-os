-- Valor V6.1 Phase 7: 7 thin, PUBLISHED source Courses gain draft V2
-- Curriculum Versions for Blueprint/Course authoring tests. Current live
-- Class Course versions, 105 Course Attempts and enrollment are untouched.
-- Draft content requires teacher and curricular publication review before use.
DO $valor_draft_expansion$
DECLARE
 v_site CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
 v_org CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
 rec record;
 idx integer;
 content_text text;
 title_text text;
 intro record;
 version_id uuid;
 unit_id uuid;
 v_count integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=v_site
   AND organization_id=v_org AND metadata @> '{"synthetic":true}'::jsonb)
 THEN RAISE EXCEPTION 'Valor synthetic Site guard failed'; END IF;
 SELECT count(*) INTO v_count FROM public.classes cls
 JOIN public.course_versions cv ON cv.id=cls.course_version_id
 JOIN public.courses c ON c.id=cv.course_id
 WHERE cls.site_id=v_site AND c.publisher_organization_id=v_org
   AND cv.lifecycle='published'
   AND (SELECT count(*) FROM public.course_lessons l WHERE l.course_version_id=cv.id)=1;
 IF v_count<>7 THEN RAISE EXCEPTION 'Expected exactly seven one-lesson published demo Courses, got %',v_count; END IF;

 FOR rec IN
  SELECT c.id course_id,c.course_code,c.title,cv.id published_version,cv.syllabus
  FROM public.classes cls JOIN public.course_versions cv ON cv.id=cls.course_version_id
  JOIN public.courses c ON c.id=cv.course_id
  WHERE cls.site_id=v_site AND c.publisher_organization_id=v_org
    AND cv.lifecycle='published'
    AND (SELECT count(*) FROM public.course_lessons l WHERE l.course_version_id=cv.id)=1
  ORDER BY c.course_code
 LOOP
  version_id:=md5('valor-v61:curriculum-v2:'||rec.course_code)::uuid;
  unit_id:=md5('valor-v61:curriculum-v2:unit:'||rec.course_code)::uuid;
  SELECT l.title,l.content INTO intro FROM public.course_lessons l
   WHERE l.course_version_id=rec.published_version LIMIT 1;
  INSERT INTO public.course_versions(id,course_id,version_no,syllabus,lifecycle)
  VALUES(version_id,rec.course_id,2,rec.syllabus||jsonb_build_object(
   'synthetic',true,'fixture','valor-v61-full-demo-20261120',
   'authoringPreview',true,'publishedVersionId',rec.published_version,
   'lessonCount',4,'requiresIndependentCurriculumReview',true),'draft')
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.course_units(id,course_version_id,unit_key,title,sequence_no,content)
  VALUES(unit_id,version_id,'starter-unit','Getting Started · '||rec.title,1,
   '{"synthetic":true,"draftOnly":true,"requiresIndependentReview":true}'::jsonb)
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.course_lessons
    (id,course_version_id,course_unit_id,lesson_key,title,lesson_order,content)
  VALUES(md5('valor-v61:curriculum-v2:lesson:'||rec.course_code||':1')::uuid,
    version_id,unit_id,'starter-1',intro.title,1,
    intro.content||'{"synthetic":true,"draftOnly":true,"copiedFromPublishedIntro":true}'::jsonb)
  ON CONFLICT(id) DO NOTHING;

  FOR idx IN 2..4 LOOP
   title_text:=CASE rec.course_code
    WHEN 'ALG-S' THEN (ARRAY['Function notation and representations',
       'Quadratic models and solutions','Investigating transformations'])[idx-1]
    WHEN 'BIO-S' THEN (ARRAY['Biological observations and testable questions',
       'Cells and structures','Evidence, variables and controlled experiments'])[idx-1]
    WHEN 'ENG-S' THEN (ARRAY['Characters, goals and conflict',
       'Theme and recurring patterns','Writing evidence-based interpretation'])[idx-1]
    WHEN 'HIS-S' THEN (ARRAY['Primary sources and historical context',
       'Geography and human settlement','Trade and cultural exchange'])[idx-1]
    WHEN 'HR-S' THEN (ARRAY['Planning your learning week',
       'Monitoring progress and asking for help','Digital citizenship and collaboration'])[idx-1]
    WHEN 'PHOTO-S' THEN (ARRAY['Composition and point of view',
       'Lighting and exposure','Editing choices and photo ethics'])[idx-1]
    WHEN 'SPAN-S' THEN (ARRAY['Greetings and introductions',
       'Numbers, dates and everyday expressions','Describing people and routines'])[idx-1]
   END;
   content_text:=CASE rec.course_code
    WHEN 'ALG-S' THEN (ARRAY[
     'Explore functions as rules connecting inputs and outputs. Compare an input-output table, a graph and a symbolic rule such as f(x)=2x+3. Compute f(0), f(2), and f(-1), then explain which representation helps answer a question most clearly.',
     'Study the quadratic relationship y=x^2-4. Make a table for x=-3 through x=3, identify where the expression equals zero, and describe how the graph differs from a line. Verify solutions by substitution.',
     'Compare y=x^2, y=(x-2)^2, and y=x^2+3. Predict and sketch how horizontal and vertical shifts change the graph, then explain one way to check the prediction.'
    ])[idx-1]
    WHEN 'BIO-S' THEN (ARRAY[
     'Separate observations from inferences about a plant growing toward light. Write one testable question and identify the evidence that would help answer it. Do not claim an observation proves causation.',
     'Compare basic cell structures including the cell membrane, cytoplasm, and genetic material. Explain why diagrams are models, and how a microscope observation could confirm or complicate a model.',
     'Design a safe seed-germination investigation using water availability as the variable. Define a control, identify what you would measure, and explain why repeating observations improves confidence.'
    ])[idx-1]
    WHEN 'ENG-S' THEN (ARRAY[
     'Read a short fictional scene. Identify a character goal, one obstacle, and a choice made in response. Explain how the choice might alter the plot and what evidence you need to support an interpretation.',
     'Distinguish theme from plot summary. In a fictional story about trust, list two repeated details and propose a possible theme statement that can be supported by specific evidence.',
     'Write a short analytical paragraph: make a precise claim, quote or paraphrase a specific fictional detail, explain how that detail supports your interpretation, and consider one alternative explanation.'
    ])[idx-1]
    WHEN 'HIS-S' THEN (ARRAY[
     'Compare a travel diary with a later textbook summary of the same historical movement. Identify author, date, intended audience, and the questions each source can and cannot answer.',
     'Using a map of rivers, mountains and routes, explain how geography could affect settlement and communication. Identify a limitation of explaining historical behavior using geography alone.',
     'Imagine two neighboring communities exchanging food, textiles and ideas. Describe incentives and risks in trade, and list evidence historians would need before claiming that a particular exchange happened.'
    ])[idx-1]
    WHEN 'HR-S' THEN (ARRAY[
     'Review your Class list and create a weekly learning plan with reading, practice, breaks and homework. Estimate time realistically, reserve a catch-up block, and identify your highest-priority task.',
     'Compare planned and completed tasks. Identify one specific obstacle and choose an appropriate response: revise a schedule, use a help resource, or ask a teacher or trusted adult for assistance.',
     'Discuss respectful online communication, protecting private data, using sources responsibly, and reporting an unsafe interaction to a trusted adult. Draft one clear rule for working in shared learning spaces.'
    ])[idx-1]
    WHEN 'PHOTO-S' THEN (ARRAY[
     'Compare center-weighted and rule-of-thirds compositions. For a hypothetical school-garden photograph, explain where you would place the subject and how background objects influence attention.',
     'Observe the effect of front, side and back lighting on a portrait or still-life image. Describe exposure, shadows and highlights, then suggest a safer or clearer lighting arrangement.',
     'Explain how cropping or editing can change interpretation. Discuss permission, privacy and respectful representation when photographing others, especially minors. No real photos are needed for this exercise.'
    ])[idx-1]
    WHEN 'SPAN-S' THEN (ARRAY[
     'Practice a simple dialogue: Hola, me llamo __. ¿Cómo te llamas? Me llamo __. Mucho gusto. Explain when to use a greeting and when to say goodbye.',
     'Practice numbers from cero to veinte, the days of the week, and saying today’s date in Spanish. Write three simple calendar statements and check accent marks when relevant.',
     'Use soy, estoy, tengo and simple adjectives in short sentences to describe a fictional person and a daily routine. Explain how you decided which expression fits each sentence.'
    ])[idx-1]
   END;
   INSERT INTO public.course_lessons
    (id,course_version_id,course_unit_id,lesson_key,title,lesson_order,content)
   VALUES(md5('valor-v61:curriculum-v2:lesson:'||rec.course_code||':'||idx)::uuid,
     version_id,unit_id,'starter-'||idx,title_text,idx,
     jsonb_build_object('title',title_text,'body',content_text,
       'synthetic',true,'draftOnly',true,'demoOnly',true,
       'source','valor-v61-extended-curriculum-draft',
       'rightsStatus','original-synthetic-content',
       'accessibilityReview','required',
       'activities',jsonb_build_array(
         jsonb_build_object('id','practice-'||idx,'title','Guided practice',
           'kind','practice','evidence','practice',
           'instructions','Work through the example and write a concise explanation of your reasoning.'),
         jsonb_build_object('id','reflect-'||idx,'title','Reflect and check',
           'kind','reflection','evidence','practice',
           'instructions','Describe one insight, one remaining question, and how you would check your result.')),
       'resources',jsonb_build_array()))
   ON CONFLICT(id) DO NOTHING;
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM public.course_versions cv
    WHERE cv.id IN (SELECT md5('valor-v61:curriculum-v2:'||c.course_code)::uuid
     FROM public.courses c JOIN public.classes cls ON cls.course_version_id IN(
       SELECT cv2.id FROM public.course_versions cv2 WHERE cv2.course_id=c.id)
     WHERE cls.site_id=v_site AND c.publisher_organization_id=v_org)
     AND cv.version_no=2 AND cv.lifecycle='draft')<>7
 OR (SELECT count(*) FROM public.course_lessons l
    JOIN public.course_versions cv ON cv.id=l.course_version_id
    WHERE cv.syllabus->>'fixture'='valor-v61-full-demo-20261120'
       AND cv.version_no=2)<>28
 THEN RAISE EXCEPTION 'Seven draft Course v2 versions or 28 lessons missing'; END IF;
END $valor_draft_expansion$;
