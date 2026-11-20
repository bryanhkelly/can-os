-- Seed unsubmitted canonical homework records for already-active synthetic
-- Jordan Class Attempts. No grades or fake completed work, no legacy Sections.
DO $prepare_jordan_work$
DECLARE
 v_jordan CONSTANT uuid := 'f1000000-0000-4000-8000-000000000005';
 v_site CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
 v_dep CONSTANT uuid := md5('valor-v61:deployment')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.people WHERE id=v_jordan AND metadata @> '{"synthetic":true}'::jsonb)
   OR NOT EXISTS(SELECT 1 FROM public.sites WHERE id=v_site AND metadata @> '{"synthetic":true}'::jsonb)
   OR (SELECT count(*) FROM public.class_enrollments ce JOIN public.classes c ON c.id=ce.class_id
       WHERE ce.learner_person_id=v_jordan AND ce.status='active'
       AND c.site_id=v_site AND c.deployment_id=v_dep)<>9
 THEN RAISE EXCEPTION 'Jordan synthetic active Class guard failed'; END IF;
 INSERT INTO public.graded_submissions(id,course_attempt_id,course_version_id,assignment_id,status,response)
 SELECT md5('valor-v61:jordan-homework:'||lca.id||':'||ga.id)::uuid,
        lca.id,lca.course_version_id,ga.id,'assigned','{}'::jsonb
 FROM public.class_enrollments ce
 JOIN public.classes c ON c.id=ce.class_id
 JOIN public.learner_course_attempts lca ON lca.id=ce.course_attempt_id
 JOIN public.graded_assignments ga ON ga.course_version_id=c.course_version_id AND ga.section_id IS NULL
 WHERE ce.learner_person_id=v_jordan AND ce.status='active' AND lca.status='active'
   AND c.site_id=v_site AND c.deployment_id=v_dep
 ON CONFLICT(course_attempt_id,assignment_id) DO NOTHING;
 IF (SELECT count(*) FROM public.graded_submissions gs
      JOIN public.learner_course_attempts lca ON lca.id=gs.course_attempt_id
      JOIN public.class_enrollments ce ON ce.id=lca.class_enrollment_id
      JOIN public.classes c ON c.id=ce.class_id
      WHERE ce.learner_person_id=v_jordan AND c.site_id=v_site
      AND c.deployment_id=v_dep AND gs.status='assigned')<>18
 THEN RAISE EXCEPTION 'Jordan assigned homework count mismatch'; END IF;
END $prepare_jordan_work$
