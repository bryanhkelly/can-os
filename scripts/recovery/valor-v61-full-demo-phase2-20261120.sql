-- CAN OS Valor V6.1 full synthetic demo: Phase 2, persist varied learning
-- milestones and written homework. Course/Unit/Lesson contents are unchanged.
-- No official grades, teacher approvals, certificates, attendance or credit.
-- Existing real/previously edited submissions and progress are never overwritten.
DO $valor_full_learning$
DECLARE
 v_site CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
 v_dep CONSTANT uuid := md5('valor-v61:deployment')::uuid;
 v_jordan CONSTANT uuid := 'f1000000-0000-4000-8000-000000000005';
 v_active integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=v_site AND metadata @> '{"synthetic":true}'::jsonb) THEN
   RAISE EXCEPTION 'Valor synthetic Site guard failed';
 END IF;
 SELECT count(*) INTO v_active
 FROM public.learner_course_attempts a
 JOIN public.class_enrollments e ON e.id=a.class_enrollment_id
 JOIN public.classes c ON c.id=e.class_id
 WHERE c.site_id=v_site AND c.deployment_id=v_dep AND e.status='active'
   AND a.status='active' AND e.course_attempt_id=a.id
   AND (e.learner_person_id=v_jordan OR
     EXISTS (SELECT 1 FROM public.student_profiles sp
       JOIN public.people p ON p.id=sp.person_id
       WHERE sp.person_id=e.learner_person_id
         AND sp.student_number IN (SELECT 'V26-'||n::text FROM generate_series(101,116) n)
         AND p.metadata @> '{"synthetic":true}'::jsonb));
 IF v_active<>105 THEN RAISE EXCEPTION 'Expected exactly 105 verified synthetic native Attempts, found %',v_active; END IF;

 -- Only new canonical homework; do not copy or invent any official grade.
 INSERT INTO public.graded_submissions
  (id,course_attempt_id,course_version_id,assignment_id,status,response)
 SELECT md5('valor-v61:demo-homework:'||a.id||':'||ga.id)::uuid,
   a.id,a.course_version_id,ga.id,'assigned','{}'::jsonb
 FROM public.learner_course_attempts a
 JOIN public.class_enrollments e ON e.id=a.class_enrollment_id
 JOIN public.classes c ON c.id=e.class_id
 JOIN public.people p ON p.id=e.learner_person_id
 JOIN public.graded_assignments ga ON ga.course_version_id=a.course_version_id
   AND ga.section_id IS NULL
 WHERE c.site_id=v_site AND c.deployment_id=v_dep AND e.status='active'
   AND a.status='active' AND e.course_attempt_id=a.id
   AND p.metadata @> '{"synthetic":true}'::jsonb
 ON CONFLICT(course_attempt_id,assignment_id) DO NOTHING;

 -- Staged written response states for end-to-end teacher/guardian testing.
 -- Jordan keeps fourteen untouched 'assigned' homework entries to test
 -- actual new submission, while four are simulated review examples.
 WITH relevant AS (
 SELECT gs.id,gs.status,gs.response,
    p.id AS person_id,sp.student_number,ga.assignment_key,
    c.title class_title,ga.assignment_spec,
    row_number() OVER(PARTITION BY p.id ORDER BY c.title,ga.assignment_key) rn
 FROM public.graded_submissions gs
 JOIN public.learner_course_attempts a ON a.id=gs.course_attempt_id
 JOIN public.class_enrollments e ON e.id=a.class_enrollment_id
 JOIN public.classes c ON c.id=e.class_id
 JOIN public.people p ON p.id=e.learner_person_id
 LEFT JOIN public.student_profiles sp ON sp.person_id=p.id
 JOIN public.graded_assignments ga ON ga.id=gs.assignment_id
 WHERE c.site_id=v_site AND c.deployment_id=v_dep AND e.status='active'
   AND a.status='active' AND e.course_attempt_id=a.id
   AND p.metadata @> '{"synthetic":true}'::jsonb
 ), staged AS (
 SELECT *,
   CASE
    WHEN person_id=v_jordan THEN CASE rn WHEN 1 THEN 'graded' WHEN 2 THEN 'returned'
      WHEN 3 THEN 'submitted' WHEN 4 THEN 'submitted' ELSE 'assigned' END
    WHEN student_number IN ('V26-101','V26-102','V26-103') THEN
      CASE WHEN rn IN (1,4) THEN 'graded' WHEN rn IN(2,5) THEN 'returned'
        WHEN rn IN(3,6) THEN 'submitted' ELSE 'assigned' END
    WHEN student_number IN ('V26-104','V26-105','V26-106','V26-107') THEN
      CASE WHEN rn=1 THEN 'returned' WHEN rn IN(2,3,4) THEN 'submitted'
        ELSE 'assigned' END
    WHEN student_number IN ('V26-108','V26-109','V26-110','V26-111','V26-112') THEN
      CASE WHEN rn IN(1,2) THEN 'submitted' ELSE 'assigned' END
    WHEN student_number IN ('V26-113','V26-114') THEN
      CASE WHEN rn=1 THEN 'graded' WHEN rn=2 THEN 'submitted' ELSE 'assigned' END
    ELSE 'assigned'
   END AS staged_status
 FROM relevant
 )
 UPDATE public.graded_submissions gs
 SET status=staged.staged_status,
   submitted_at=('2026-11-10T10:00:00Z'::timestamptz + (staged.rn*interval '12 hours')),
   response=jsonb_build_object(
     'text','Synthetic practice response for '||staged.class_title||': I identified the lesson''s main idea, worked through one example and explained how I would check my reasoning. I would compare the result with the evidence in the lesson and revise my answer if needed.',
     'format','text','synthetic',true,'fixture','valor-v61-full-demo-20261120',
     'noncredit',true,'practiceResponse',true,
     'teacherFeedback',CASE WHEN staged.staged_status='graded'
       THEN 'Simulated review: clear example and reasoning. Add one more supporting detail.'
       WHEN staged.staged_status='returned' THEN 'Simulated review: revise with a more specific example.'
       ELSE NULL END,
     'demoScore',CASE WHEN staged.staged_status='graded' THEN 8 ELSE NULL END,
     'maxDemoScore',CASE WHEN staged.staged_status='graded' THEN 10 ELSE NULL END)
 FROM staged WHERE gs.id=staged.id AND staged.staged_status<>'assigned'
   AND gs.status='assigned' AND gs.response='{}'::jsonb AND gs.submitted_at IS NULL;

 -- Each person's learning history varies. Some remain unstarted; some have
 -- a handful of completed lessons followed by one in progress.
 WITH active AS (
 SELECT a.id attempt_id,a.course_version_id,e.learner_person_id,
  sp.student_number
 FROM public.learner_course_attempts a
 JOIN public.class_enrollments e ON e.id=a.class_enrollment_id
 JOIN public.classes c ON c.id=e.class_id
 JOIN public.people p ON p.id=e.learner_person_id
 LEFT JOIN public.student_profiles sp ON sp.person_id=p.id
 WHERE c.site_id=v_site AND c.deployment_id=v_dep AND e.status='active'
   AND a.status='active' AND e.course_attempt_id=a.id
   AND p.metadata @> '{"synthetic":true}'::jsonb
 ), numbered AS (
 SELECT a.attempt_id,a.course_version_id,a.learner_person_id,a.student_number,
  l.id lesson_id,row_number() OVER(PARTITION BY a.attempt_id
     ORDER BY u.sequence_no,l.lesson_order,l.id)::int AS ordinal,
  count(*) OVER(PARTITION BY a.attempt_id)::int total_lessons
 FROM active a
 JOIN public.course_lessons l ON l.course_version_id=a.course_version_id
 JOIN public.course_units u ON u.id=l.course_unit_id
 ), targets AS (
 SELECT *, CASE
   WHEN learner_person_id=v_jordan THEN LEAST(total_lessons,6)
   WHEN student_number IN('V26-110','V26-115') THEN 0
   WHEN student_number IS NOT NULL THEN
     LEAST(total_lessons,1+(right(student_number,2)::int % 5))
   ELSE 0 END AS target_lessons
 FROM numbered
 )
 INSERT INTO public.learner_lesson_progress
  (id,course_attempt_id,course_version_id,lesson_id,status,observed_at)
 SELECT md5('valor-v61:demo-progress:'||attempt_id||':'||lesson_id)::uuid,
  attempt_id,course_version_id,lesson_id,
  CASE WHEN ordinal=target_lessons AND total_lessons>target_lessons THEN 'in_progress'
       WHEN ordinal=target_lessons AND student_number IN('V26-102','V26-108','V26-113')
         THEN 'in_progress'
       ELSE 'completed' END,
  ('2026-11-07T10:00:00Z'::timestamptz
    + (ordinal*interval '18 hours'))
 FROM targets WHERE ordinal<=target_lessons
 ON CONFLICT (course_attempt_id,lesson_id) DO NOTHING;

 -- Summarized unit progress must agree with the lesson facts for that Attempt.
 WITH completed_units AS (
  SELECT lp.course_attempt_id,lp.course_version_id,u.id unit_id,
    count(*) FILTER(WHERE lp.status='completed')::int completed_lessons,
    (SELECT count(*) FROM public.course_lessons cl WHERE cl.course_unit_id=u.id)::int required_lessons
  FROM public.learner_lesson_progress lp
  JOIN public.course_lessons l ON l.id=lp.lesson_id
  JOIN public.course_units u ON u.id=l.course_unit_id
  JOIN public.learner_course_attempts a ON a.id=lp.course_attempt_id
  JOIN public.class_enrollments e ON e.id=a.class_enrollment_id
  JOIN public.classes c ON c.id=e.class_id
  JOIN public.people p ON p.id=e.learner_person_id
  WHERE c.site_id=v_site AND c.deployment_id=v_dep
    AND p.metadata @> '{"synthetic":true}'::jsonb
  GROUP BY lp.course_attempt_id,lp.course_version_id,u.id
 )
 INSERT INTO public.learner_unit_progress
  (id,course_attempt_id,course_version_id,course_unit_id,status,observed_at)
 SELECT md5('valor-v61:demo-unit:'||course_attempt_id||':'||unit_id)::uuid,
  course_attempt_id,course_version_id,unit_id,
  CASE WHEN completed_lessons=required_lessons THEN 'completed'
    ELSE 'in_progress' END,
  '2026-11-19T12:00:00Z'::timestamptz
 FROM completed_units
 ON CONFLICT (course_attempt_id,course_unit_id) DO NOTHING;

 IF (SELECT count(*) FROM public.graded_submissions gs
   JOIN public.learner_course_attempts a ON a.id=gs.course_attempt_id
   JOIN public.class_enrollments e ON e.id=a.class_enrollment_id
   JOIN public.classes c ON c.id=e.class_id
   WHERE c.site_id=v_site AND c.deployment_id=v_dep)<210 THEN
   RAISE EXCEPTION 'Expected at least 210 synthetic homework entries';
 END IF;
END $valor_full_learning$;
