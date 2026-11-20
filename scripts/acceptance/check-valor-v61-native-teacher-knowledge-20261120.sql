-- Read-only fixture acceptance for native Class teacher and assessment UI.
-- Does NOT prove deployment, source compilation, or authenticated browser access.
WITH scope AS (
 SELECT 'f1000000-0000-4000-8000-000000000003'::uuid site_id,
 'f1000000-0000-4000-8000-000000000002'::uuid org_id,
 'f1000000-0000-4000-8000-000000000006'::uuid teacher,
 'f1000000-0000-4000-8000-000000000005'::uuid student,
 md5('valor-v61:deployment')::uuid deployment_id
), cls AS (
 SELECT c.id,c.course_version_id,c.deployment_id
 FROM public.classes c JOIN scope s ON c.site_id=s.site_id
 WHERE c.state='active' AND c.deployment_id=s.deployment_id
), metrics AS (
 SELECT '01 synthetic Valor Site' metric,
 (SELECT count(*)::int FROM public.sites st JOIN scope s ON st.id=s.site_id
  WHERE st.metadata @> '{"synthetic":true}'::jsonb) actual, 1 expected
 UNION ALL SELECT '02 directly verified teacher grant',
 (SELECT count(*)::int FROM public.account_person_grants g
   JOIN public.access_accounts ac ON ac.id=g.account_id
   JOIN scope s ON s.teacher=g.person_id AND s.org_id=g.organization_id AND s.site_id=g.site_id
   WHERE g.role='teacher' AND g.active AND ac.email_verified_at IS NOT NULL
   AND NOT ac.disabled AND ac.email_normalized='riley.teacher@valorschool.demo'),1
 UNION ALL SELECT '03 active current Class staff appointments',
 (SELECT count(*)::int FROM public.class_staff_assignments sa
   JOIN cls c ON c.id=sa.class_id JOIN scope s ON s.teacher=sa.person_id
   WHERE sa.role_code='teacher' AND sa.state='approved'
   AND sa.begins_at<=now() AND (sa.ends_at IS NULL OR sa.ends_at>now())),12
 UNION ALL SELECT '04 native Class Enrollment-linked submitted homework',
 (SELECT count(*)::int FROM public.graded_submissions gs
   JOIN public.learner_course_attempts a ON a.id=gs.course_attempt_id
   JOIN public.class_enrollments e ON e.id=a.class_enrollment_id
    AND e.course_attempt_id=a.id AND e.status='active'
   JOIN cls c ON c.id=e.class_id AND c.course_version_id=a.course_version_id
   WHERE gs.status IN('submitted','returned','graded') AND a.status='active'
     AND a.section_id IS NULL),52
 UNION ALL SELECT '05 Jordan active Class enrollments',
 (SELECT count(*)::int FROM public.class_enrollments e
   JOIN cls c ON c.id=e.class_id JOIN scope s ON e.learner_person_id=s.student
   WHERE e.status='active' AND e.course_attempt_id IS NOT NULL),9
 UNION ALL SELECT '06 draft Course assessment administrations',
 (SELECT count(*)::int FROM public.assessment_administrations ad JOIN cls c
   ON ad.course_version_id=c.course_version_id
    AND ad.deployment_id=c.deployment_id
   WHERE ad.administration_code LIKE 'valor.demo.%.draft.preflight'
     AND ad.status='draft'),12
 UNION ALL SELECT '07 published active assessment administrations',
 (SELECT count(*)::int FROM public.assessment_administrations ad JOIN cls c
   ON ad.course_version_id=c.course_version_id AND ad.deployment_id=c.deployment_id
   WHERE ad.status='open' AND ad.administration_code LIKE 'valor.demo.%'),0
 UNION ALL SELECT '08 grants for draft administrations',
 (SELECT count(*)::int FROM public.assessment_access_grants ag
 JOIN public.assessment_administrations ad ON ad.id=ag.administration_id
 WHERE ad.administration_code LIKE 'valor.demo.%.draft.preflight'),0
 UNION ALL SELECT '09 proposed independent grader, not approved',
 (SELECT count(*)::int FROM public.grading_assignments ga
  WHERE ga.id=md5('valor-v61:review:proposed-riley-algebra1')::uuid
  AND ga.status='proposed' AND ga.capability_authorization_id IS NULL),1
 UNION ALL SELECT '10 approved graded decisions for proposed grader',
 (SELECT count(*)::int FROM public.grading_decisions gd
 WHERE gd.grading_assignment_id=md5('valor-v61:review:proposed-riley-algebra1')::uuid),0
 UNION ALL SELECT '11 issued official grades to Valor Course Attempts',
 (SELECT count(*)::int FROM public.official_course_grades g
 JOIN public.learner_course_attempts a ON a.id=g.course_attempt_id
 JOIN public.class_enrollments e ON e.id=a.class_enrollment_id
 JOIN cls c ON c.id=e.class_id),0
 UNION ALL SELECT '12 active Class Attempts referencing retired Sections',
 (SELECT count(*)::int FROM public.learner_course_attempts a
 JOIN public.class_enrollments e ON e.id=a.class_enrollment_id
 JOIN cls c ON c.id=e.class_id
 WHERE e.status='active' AND a.section_id IS NOT NULL),0
)
SELECT metric, actual, expected, actual=expected passed,
 count(*) FILTER (WHERE actual<>expected) OVER () AS failed_checks
FROM metrics ORDER BY metric;
