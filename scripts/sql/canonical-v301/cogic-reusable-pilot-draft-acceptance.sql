-- Read-only check of the two reusable CAN pilot delivery drafts.
-- These are synthetic planning fixtures, not independently authorized COGIC
-- offerings or actual learner registrations.
-- Run on the expected Neon branch after the seed script.
DO $pilot_check$
DECLARE wrong integer; count_rows integer;
BEGIN
 SELECT count(*) INTO count_rows FROM public.offering_versions ov
 JOIN public.offerings o ON o.id=ov.offering_id
 JOIN public.noncredit_training_versions t ON t.offering_version_id=ov.id
 JOIN public.assessment_versions av ON av.id=t.assessment_version_id
 WHERE o.code IN ('CLC-CUSTOM-TRAINING-01','CLC-DIGITAL-01')
   AND o.publisher_organization_id='ca270000-0000-4000-8000-000000000001'::uuid
   AND ov.lifecycle='draft' AND t.state='draft' AND av.lifecycle='draft'
   AND t.approved_by_person_id IS NULL AND t.published_at IS NULL;
 IF count_rows <> 2 THEN RAISE EXCEPTION 'Expected two unapproved draft training versions; found %',count_rows; END IF;
 SELECT count(*) INTO wrong FROM (
   SELECT o.code, count(DISTINCT cl.id) AS lessons
   FROM public.offerings o JOIN public.offering_versions ov ON ov.offering_id=o.id
   JOIN public.offering_courses oc ON oc.offering_version_id=ov.id
   JOIN public.course_versions cv ON cv.id=oc.course_version_id
   LEFT JOIN public.course_lessons cl ON cl.course_version_id=cv.id
   WHERE o.code IN ('CLC-CUSTOM-TRAINING-01','CLC-DIGITAL-01')
   AND cv.lifecycle='draft'
   GROUP BY o.code
   HAVING count(DISTINCT cl.id) <> CASE o.code WHEN 'CLC-CUSTOM-TRAINING-01' THEN 7 ELSE 4 END
 ) incorrect;
 IF wrong > 0 THEN RAISE EXCEPTION 'Pilot Course draft lessons are incomplete'; END IF;
 SELECT count(*) INTO wrong FROM (
   SELECT d.assessment_key,count(fi.id) AS questions
   FROM public.assessment_definitions d
   JOIN public.assessment_versions av ON av.assessment_id=d.id AND av.lifecycle='draft'
   JOIN public.assessment_form_versions fv ON fv.assessment_version_id=av.id AND fv.lifecycle='draft'
   JOIN public.assessment_form_items fi ON fi.form_version_id=fv.id
   WHERE d.assessment_key IN ('pilot.custom_training.knowledge_check','pilot.ai_digital_skills.knowledge_check')
   GROUP BY d.assessment_key
   HAVING count(fi.id) <> 5
 ) incorrect;
 IF wrong > 0 OR (SELECT count(*) FROM public.assessment_definitions
   WHERE assessment_key IN ('pilot.custom_training.knowledge_check','pilot.ai_digital_skills.knowledge_check'))<>2
 THEN RAISE EXCEPTION 'Expected exactly five draft assessment questions per pilot'; END IF;
 SELECT count(*) INTO wrong FROM (
   SELECT d.code,count(q.id) AS questions
   FROM public.survey_definitions d
   JOIN public.survey_versions v ON v.survey_id=d.id AND v.lifecycle='draft'
   JOIN public.survey_questions q ON q.survey_version_id=v.id
   WHERE d.code IN ('pilot.custom_training.feedback','pilot.ai_digital_skills.feedback')
   GROUP BY d.code HAVING count(q.id) <> 5
 ) incorrect;
 IF wrong > 0 OR (SELECT count(*) FROM public.survey_definitions
    WHERE code IN ('pilot.custom_training.feedback','pilot.ai_digital_skills.feedback'))<>2
 THEN RAISE EXCEPTION 'Expected exactly five draft feedback questions per pilot'; END IF;
END $pilot_check$;

SELECT o.code AS offering_code,ov.lifecycle AS offering_status,cv.lifecycle AS course_status,
 (SELECT COUNT(*) FROM public.course_lessons l WHERE l.course_version_id=cv.id) AS lesson_count,
 t.state AS training_status,t.approved_by_person_id IS NOT NULL AS approved_training,
 av.lifecycle AS assessment_status,
 (SELECT COUNT(*) FROM public.assessment_form_items fi
  JOIN public.assessment_form_versions fv ON fv.id=fi.form_version_id
  WHERE fv.assessment_version_id=av.id) AS assessment_questions,
 (SELECT COUNT(*) FROM public.survey_questions sq
  JOIN public.survey_versions sv ON sv.id=sq.survey_version_id
  JOIN public.survey_definitions sd ON sd.id=sv.survey_id
  WHERE sd.code=CASE o.code WHEN 'CLC-CUSTOM-TRAINING-01' THEN 'pilot.custom_training.feedback'
                            ELSE 'pilot.ai_digital_skills.feedback' END) AS feedback_questions
FROM public.offerings o
JOIN public.offering_versions ov ON ov.offering_id=o.id
JOIN public.offering_courses oc ON oc.offering_version_id=ov.id
JOIN public.course_versions cv ON cv.id=oc.course_version_id
JOIN public.noncredit_training_versions t ON t.offering_version_id=ov.id
JOIN public.assessment_versions av ON av.id=t.assessment_version_id
WHERE o.code IN ('CLC-CUSTOM-TRAINING-01','CLC-DIGITAL-01')
ORDER BY o.code;
