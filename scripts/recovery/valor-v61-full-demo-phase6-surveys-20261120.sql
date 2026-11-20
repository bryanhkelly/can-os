-- Valor V6.1 Phase 6: reusable, draft-only feedback surveys.
-- No survey publication, invitations, consent collection, outbound delivery,
-- responses, anonymous tokens or verified impact metrics are created.
DO $valor_demo_surveys$
DECLARE
 v_site CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
 v_org CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
 v_alex CONSTANT uuid:='f7000000-0000-4000-8000-000000000001';
 rec record;
 i integer;
 survey_id uuid;
 survey_version_id uuid;
 campaign_id uuid;
 question text;
 kind text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites
   WHERE id=v_site AND organization_id=v_org AND metadata @> '{"synthetic":true}'::jsonb)
 OR NOT EXISTS(SELECT 1 FROM public.people
   WHERE id=v_alex AND metadata @> '{"synthetic":true}'::jsonb)
 THEN RAISE EXCEPTION 'Synthetic Valor Site or operator changed'; END IF;
 FOR rec IN SELECT * FROM (VALUES
   ('student-feedback','Valor demo student learning feedback','learner','identified'),
   ('family-feedback','Valor demo guardian communication feedback','guardian','identified')
 ) v(key,title,audience,response_mode)
 LOOP
   survey_id:=md5('valor-v61:survey:'||rec.key)::uuid;
   survey_version_id:=md5('valor-v61:survey-version:'||rec.key)::uuid;
   campaign_id:=md5('valor-v61:survey-campaign:'||rec.key)::uuid;
   INSERT INTO public.survey_definitions
    (id,owner_organization_id,code,title,purpose_code,intended_audience,status)
   VALUES(survey_id,v_org,'valor.v61.demo.'||rec.key,rec.title,
     'course_feedback',rec.audience,'active')
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.survey_versions
    (id,survey_id,version_no,locale,author_person_id,lifecycle)
   VALUES(survey_version_id,survey_id,1,'en-US',v_alex,'draft')
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.survey_campaigns
    (id,survey_version_id,operating_organization_id,site_id,
     response_mode,status,starts_at,ends_at,minimum_reporting_cell,authorized_by_person_id)
   VALUES(campaign_id,survey_version_id,v_org,v_site,rec.response_mode,'draft',
     '2026-11-23T09:00:00Z','2026-12-18T23:00:00Z',10,v_alex)
   ON CONFLICT(id) DO NOTHING;
   FOR i IN 1..4 LOOP
     question:=CASE rec.key
       WHEN 'student-feedback' THEN (ARRAY[
         'How helpful was the opening lesson in your Class?',
         'How easy was it to find and submit your homework?',
         'What was the most confusing part of the learning experience?',
         'What should your teacher know about your progress?'
       ])[i]
       ELSE (ARRAY[
         'How easy was it to find the Class progress of your linked learner?',
         'How clear were the homework status and feedback labels?',
         'What information would help you support learning at home?',
         'What could improve school-family communication?'
       ])[i] END;
     kind:=CASE WHEN i<=2 THEN 'rating' ELSE 'text' END;
     INSERT INTO public.survey_questions
       (id,survey_version_id,question_key,prompt_text,ordinal,question_type,
        required,safety_triage,rating_min,rating_max)
     VALUES(md5('valor-v61:survey-question:'||rec.key||':'||i)::uuid,
       survey_version_id,'demo-question-'||i,question,i,kind,false,false,
       CASE WHEN kind='rating' THEN 1 ELSE NULL END,
       CASE WHEN kind='rating' THEN 5 ELSE NULL END)
     ON CONFLICT(id) DO NOTHING;
   END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM public.survey_campaigns
     WHERE id IN(md5('valor-v61:survey-campaign:student-feedback')::uuid,
                 md5('valor-v61:survey-campaign:family-feedback')::uuid)
     AND status='draft')<>2
 OR (SELECT count(*) FROM public.survey_questions sq
    WHERE sq.survey_version_id IN
     (md5('valor-v61:survey-version:student-feedback')::uuid,
      md5('valor-v61:survey-version:family-feedback')::uuid))<>8
 THEN RAISE EXCEPTION 'Valor demo draft feedback surveys incomplete'; END IF;
END $valor_demo_surveys$;
