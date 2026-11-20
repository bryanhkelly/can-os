-- Read-only canonical Valor synthetic fixture acceptance (November 20 2026).
-- Run after phases 1..7. No retired Sections/Cohorts read.
-- Do not confuse fixture data integrity with successful browser deployment,
-- authenticated user flows, legal academic approval or content review.
WITH scoped_classes AS (
 SELECT c.id,c.course_version_id,c.deployment_id,c.adoption_id,c.state,c.delivery_mode
 FROM public.classes c
 WHERE c.site_id='f1000000-0000-4000-8000-000000000003'::uuid
  AND c.deployment_id=md5('valor-v61:deployment')::uuid
), scoped_enrollments AS (
 SELECT e.* FROM public.class_enrollments e
 JOIN scoped_classes c ON c.id=e.class_id
), scoped_attempts AS (
 SELECT a.* FROM public.learner_course_attempts a
 JOIN scoped_enrollments e ON e.id=a.class_enrollment_id
), metrics AS (
 SELECT '01 synthetic Site' AS metric,
 (SELECT count(*)::int FROM public.sites
   WHERE id='f1000000-0000-4000-8000-000000000003'::uuid
     AND metadata @> '{"synthetic":true}'::jsonb) observed,1 min_expected,1 max_expected
 UNION ALL SELECT '02 active self-paced Classes',(SELECT count(*)::int FROM scoped_classes
   WHERE state='active' AND delivery_mode='self_paced'),12,12
 UNION ALL SELECT '03 active Class Enrollments',(SELECT count(*)::int
   FROM scoped_enrollments WHERE status='active'),105,NULL::int
 UNION ALL SELECT '04 active canonical Course Attempts',(SELECT count(*)::int
   FROM scoped_attempts WHERE status='active'),105,NULL::int
 UNION ALL SELECT '05 dangling or misattributed active Attempts',(
   SELECT count(*)::int FROM scoped_enrollments e
   JOIN scoped_classes c ON c.id=e.class_id
   LEFT JOIN public.learner_course_attempts a ON a.class_enrollment_id=e.id
   WHERE e.status='active' AND
     (a.id IS NULL OR e.course_attempt_id IS DISTINCT FROM a.id
      OR a.course_version_id IS DISTINCT FROM c.course_version_id
      OR a.deployment_id IS DISTINCT FROM c.deployment_id
      OR a.adoption_id IS DISTINCT FROM c.adoption_id
      OR a.section_id IS NOT NULL)),0,0
 UNION ALL SELECT '06 Jordan active Classes',(SELECT count(*)::int FROM scoped_enrollments
    WHERE learner_person_id='f1000000-0000-4000-8000-000000000005'::uuid AND status='active'),9,9
 UNION ALL SELECT '07 preserved Jordan withdrawals',(SELECT count(*)::int FROM scoped_enrollments
    WHERE learner_person_id='f1000000-0000-4000-8000-000000000005'::uuid AND status='withdrawn'),1,1
 UNION ALL SELECT '08 pending onboarding placements',(SELECT count(*)::int FROM scoped_enrollments
    WHERE status='pending'),24,NULL::int
 UNION ALL SELECT '09 current canonical teaching assignments',(SELECT count(*)::int
    FROM public.class_staff_assignments st JOIN scoped_classes c ON c.id=st.class_id
    WHERE st.role_code='teacher' AND st.state='approved'),12,12
 UNION ALL SELECT '10 published Class lesson corpus',(SELECT count(*)::int
    FROM public.course_lessons l JOIN scoped_classes c ON c.course_version_id=l.course_version_id),746,746
 UNION ALL SELECT '11 draft Course V2 curriculum versions',(SELECT count(*)::int
    FROM public.course_versions cv
    WHERE cv.syllabus->>'fixture'='valor-v61-full-demo-20261120'
      AND cv.version_no=2 AND cv.lifecycle='draft'),7,7
 UNION ALL SELECT '12 unpublished V2 new lessons',(SELECT count(*)::int
    FROM public.course_lessons l JOIN public.course_versions cv
      ON cv.id=l.course_version_id WHERE cv.syllabus->>'fixture'='valor-v61-full-demo-20261120'
      AND cv.version_no=2),28,28
 UNION ALL SELECT '13 canonical written assignment definitions',(SELECT count(*)::int
    FROM public.graded_assignments ga JOIN scoped_classes c
       ON c.course_version_id=ga.course_version_id
    WHERE ga.section_id IS NULL),24,24
 UNION ALL SELECT '14 canonical homework records',(SELECT count(*)::int
    FROM public.graded_submissions gs JOIN scoped_attempts a ON a.id=gs.course_attempt_id),210,NULL::int
 UNION ALL SELECT '15 simulated submitted homework',(SELECT count(*)::int
    FROM public.graded_submissions gs JOIN scoped_attempts a ON a.id=gs.course_attempt_id
    WHERE gs.status='submitted'),32,NULL::int
 UNION ALL SELECT '16 simulated returned homework',(SELECT count(*)::int
    FROM public.graded_submissions gs JOIN scoped_attempts a ON a.id=gs.course_attempt_id
    WHERE gs.status='returned'),11,NULL::int
 UNION ALL SELECT '17 simulated graded homework',(SELECT count(*)::int
    FROM public.graded_submissions gs JOIN scoped_attempts a ON a.id=gs.course_attempt_id
    WHERE gs.status='graded' AND gs.response @> '{"synthetic":true}'::jsonb),9,NULL::int
 UNION ALL SELECT '18 canonical lesson progress milestones',(SELECT count(*)::int
    FROM public.learner_lesson_progress lp JOIN scoped_attempts a
      ON a.id=lp.course_attempt_id),195,NULL::int
 UNION ALL SELECT '19 canonical unit progress milestones',(SELECT count(*)::int
    FROM public.learner_unit_progress up JOIN scoped_attempts a
      ON a.id=up.course_attempt_id),93,NULL::int
 UNION ALL SELECT '20 draft formative assessment versions',(SELECT count(*)::int
    FROM public.assessment_versions av JOIN scoped_classes c
      ON av.course_version_id=c.course_version_id
    WHERE av.lifecycle='draft' AND av.assessment_key LIKE 'valor.demo.%'),12,12
 UNION ALL SELECT '21 assessment form questions',(SELECT count(*)::int
    FROM public.assessment_form_items afi
    JOIN public.assessment_form_versions fv ON fv.id=afi.form_version_id
    JOIN public.assessment_versions av ON av.id=fv.assessment_version_id
    JOIN scoped_classes c ON c.course_version_id=av.course_version_id
    WHERE av.assessment_key LIKE 'valor.demo.%' AND fv.lifecycle='draft'),36,36
 UNION ALL SELECT '22 published unreviewed Valor assessments',(SELECT count(*)::int
    FROM public.assessment_versions av JOIN scoped_classes c
      ON c.course_version_id=av.course_version_id
    WHERE av.assessment_key LIKE 'valor.demo.%' AND av.lifecycle='published'),0,0
 UNION ALL SELECT '23 simulated physical planning spaces',(SELECT count(*)::int
    FROM public.site_spaces sp WHERE sp.site_id='f1000000-0000-4000-8000-000000000003'::uuid
      AND sp.code LIKE 'valor-demo-%'),3,3
 UNION ALL SELECT '24 device inventory scenarios',(SELECT count(*)::int
    FROM public.site_device_registrations WHERE site_id='f1000000-0000-4000-8000-000000000003'::uuid),4,4
 UNION ALL SELECT '25 brand-pinned draft marketing packages',(SELECT count(*)::int
    FROM public.site_marketing_packages m
    JOIN public.site_brand_versions v ON v.id=m.brand_version_id AND v.site_id=m.site_id
    WHERE m.site_id='f1000000-0000-4000-8000-000000000003'::uuid AND m.status='draft'),3,3
 UNION ALL SELECT '26 fictional admissions prospects',(SELECT count(*)::int
    FROM public.enrollment_prospects WHERE id IN
      (md5('valor-v61:prospect:family-one')::uuid,
       md5('valor-v61:prospect:family-two')::uuid,
       md5('valor-v61:prospect:family-three')::uuid,
       md5('valor-v61:prospect:family-four')::uuid)),4,4
 UNION ALL SELECT '27 fictional in-app message records',(SELECT count(*)::int
    FROM public.communication_messages
    WHERE thread_id IN (md5('valor-v61:thread:jordan-riley')::uuid,
                        md5('valor-v61:thread:morgan-alex')::uuid,
                        md5('valor-v61:thread:riley-jordan')::uuid)
    AND metadata @> '{"synthetic":true,"notActuallySent":true}'::jsonb),6,6
 UNION ALL SELECT '28 draft learner and family feedback campaigns',(SELECT count(*)::int
    FROM public.survey_campaigns WHERE id IN
     (md5('valor-v61:survey-campaign:student-feedback')::uuid,
      md5('valor-v61:survey-campaign:family-feedback')::uuid)
    AND status='draft'),2,2
 UNION ALL SELECT '29 draft feedback questions',(SELECT count(*)::int
    FROM public.survey_questions
    WHERE survey_version_id IN (md5('valor-v61:survey-version:student-feedback')::uuid,
                                md5('valor-v61:survey-version:family-feedback')::uuid)),8,8
 UNION ALL SELECT '30 official grades erroneously issued',(SELECT count(*)::int
    FROM public.official_course_grades g JOIN scoped_attempts a
      ON a.id=g.course_attempt_id),0,0
 UNION ALL SELECT '31 unplanned Class Sessions',(SELECT count(*)::int
    FROM public.class_sessions cs JOIN scoped_classes c ON c.id=cs.class_id),0,0
)
SELECT metric,observed,min_expected,max_expected,
   (observed>=min_expected AND (max_expected IS NULL OR observed<=max_expected)) AS passed,
   count(*) FILTER(WHERE NOT(observed>=min_expected AND
       (max_expected IS NULL OR observed<=max_expected))) OVER() AS failed_checks
FROM metrics ORDER BY metric;
