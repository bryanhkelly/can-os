-- Reconcile completed synthetic Valor lesson evidence only when the current
-- legacy lesson is identical to the native lesson except recovery metadata.
-- No guessed progress for incomplete rows, no credit, no legacy deletion.
DO $reconcile$
DECLARE
  site CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
  org CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
  rec record;
  candidate_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=site AND organization_id=org AND metadata @> '{"synthetic":true}'::jsonb)
    THEN RAISE EXCEPTION 'Synthetic Valor scope not verified'; END IF;
  FOR rec IN
    SELECT lp.id AS source_id, lp.completed_at,ce.course_attempt_id,c.course_version_id,l.id AS lesson_id
    FROM public.lesson_progress lp
    JOIN public.student_profiles sp ON sp.id=lp.student_profile_id
    JOIN public.sections s ON s.id=lp.section_id AND s.course_template_version_id=lp.course_template_version_id
    JOIN public.course_template_versions tv ON tv.id=lp.course_template_version_id
    CROSS JOIN LATERAL jsonb_array_elements(tv.curriculum->'learning'->'modules') m
    CROSS JOIN LATERAL jsonb_array_elements(m->'lessons') src
    JOIN public.enrollments e ON e.section_id=s.id AND e.student_profile_id=sp.id AND e.status='active'
    JOIN public.class_enrollments ce ON ce.id=md5('valor-v61:classenrollment:'||e.id)::uuid AND ce.learner_person_id=sp.person_id AND ce.status='active'
    JOIN public.classes c ON c.id=ce.class_id
    JOIN public.learner_course_attempts a ON a.id=ce.course_attempt_id AND a.class_enrollment_id=ce.id AND a.course_version_id=c.course_version_id AND a.status='active'
    JOIN public.course_lessons l ON l.course_version_id=c.course_version_id AND l.content->>'id'=lp.lesson_id
    WHERE s.site_id=site AND s.metadata @> '{"synthetic":true}'::jsonb AND e.metadata @> '{"synthetic":true}'::jsonb
      AND c.site_id=site AND c.operating_organization_id=org AND ce.credit_mode='not_applicable'
      AND lp.completed_at IS NOT NULL AND src->>'id'=lp.lesson_id
      AND (l.content - ARRAY['demoOnly','source','synthetic'])=src
      AND l.content->>'source'='valor-v61-rehydration'
      AND (SELECT count(*) FROM public.course_lessons x WHERE x.course_version_id=c.course_version_id AND x.content->>'id'=lp.lesson_id)=1
  LOOP
    INSERT INTO public.learner_lesson_progress(id,course_attempt_id,course_version_id,lesson_id,status,observed_at)
    VALUES(md5('valor-native-progress-reconcile:'||rec.source_id)::uuid,rec.course_attempt_id,rec.course_version_id,rec.lesson_id,'completed',rec.completed_at)
    ON CONFLICT(course_attempt_id,lesson_id) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.learner_lesson_progress p WHERE p.course_attempt_id=rec.course_attempt_id AND p.lesson_id=rec.lesson_id AND p.status='completed')
      THEN RAISE EXCEPTION 'Conflicting native progress for legacy evidence %',rec.source_id; END IF;
  END LOOP;
END $reconcile$;