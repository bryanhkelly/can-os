-- Read-only academic integrity inventory; aggregate results only.
-- A finding is not authorization to activate enrollment or award credit.
WITH legacy AS (
 SELECT e.id,e.status,sec.site_id,sp.person_id,
   ce.id AS recovered_id,ce.status AS recovered_status
 FROM public.enrollments e
 JOIN public.sections sec ON sec.id=e.section_id
 JOIN public.student_profiles sp ON sp.id=e.student_profile_id
 LEFT JOIN public.class_enrollments ce
   ON ce.id=md5('valor-v61:classenrollment:'||e.id)::uuid
   AND ce.learner_person_id=sp.person_id
   AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id=ce.class_id
     AND c.site_id=sec.site_id AND c.id=md5('valor-v61:class:'||sec.code)::uuid)
 WHERE e.kind='section'
), native AS (
 SELECT ce.id,ce.status,ce.credit_mode,ce.learner_person_id,
   c.site_id,c.operating_organization_id,c.course_version_id,
   a.id AS attempt_id,a.class_enrollment_id AS reverse_id,
   a.course_version_id AS attempt_version,a.status AS attempt_status,
   cv.lifecycle,cv.syllabus
 FROM public.class_enrollments ce JOIN public.classes c ON c.id=ce.class_id
 LEFT JOIN public.learner_course_attempts a ON a.id=ce.course_attempt_id
 LEFT JOIN public.course_versions cv ON cv.id=c.course_version_id
), catalog AS (
 SELECT c.id,c.site_id,cv.syllabus,
   (SELECT count(*) FROM public.course_lessons l WHERE l.course_version_id=c.course_version_id) lessons,
   (SELECT count(*) FROM public.track_lesson_presentations t WHERE t.course_version_id=c.course_version_id) presentations
 FROM public.classes c LEFT JOIN public.course_versions cv ON cv.id=c.course_version_id
), findings AS (
 SELECT 'legacy_active_without_recovered_class' code,'P0' priority,site_id,count(*) affected
 FROM legacy WHERE status='active' AND recovered_id IS NULL GROUP BY site_id
 UNION ALL SELECT 'legacy_active_native_not_active','P0',site_id,count(*) FROM legacy WHERE status='active' AND recovered_id IS NOT NULL AND recovered_status IS DISTINCT FROM 'active' GROUP BY site_id
 UNION ALL SELECT 'native_active_attempt_mismatch','P0',site_id,count(*) FROM native WHERE status='active' AND (attempt_id IS NULL OR reverse_id IS DISTINCT FROM id OR attempt_version IS DISTINCT FROM course_version_id OR attempt_status IS DISTINCT FROM 'active') GROUP BY site_id
 UNION ALL SELECT 'native_active_unpublished_course','P0',site_id,count(*) FROM native WHERE status='active' AND lifecycle IS DISTINCT FROM 'published' GROUP BY site_id
 UNION ALL SELECT 'pending_without_verified_student_grant','P0',site_id,count(*) FROM native n WHERE status='pending' AND NOT EXISTS (SELECT 1 FROM public.account_person_grants g JOIN public.access_accounts a ON a.id=g.account_id WHERE g.person_id=n.learner_person_id AND g.site_id=n.site_id AND g.organization_id=n.operating_organization_id AND g.active AND g.role='student' AND a.person_id=g.person_id AND NOT a.disabled AND a.email_verified_at IS NOT NULL) GROUP BY site_id
 UNION ALL SELECT 'class_no_lessons','P0',site_id,count(*) FROM catalog WHERE lessons=0 GROUP BY site_id
 UNION ALL SELECT 'class_minimal_lesson_inventory','P1',site_id,count(*) FROM catalog WHERE lessons BETWEEN 1 AND 3 GROUP BY site_id
 UNION ALL SELECT 'class_no_track_presentations','P1',site_id,count(*) FROM catalog WHERE presentations=0 GROUP BY site_id
 UNION ALL SELECT 'synthetic_course_in_active_enrollment','P1',site_id,count(*) FROM native WHERE status='active' AND syllabus->>'synthetic'='true' GROUP BY site_id
 UNION ALL SELECT 'active_demo_noncredit_mode','P1',site_id,count(*) FROM native WHERE status='active' AND credit_mode='not_applicable' AND syllabus->>'synthetic'='true' GROUP BY site_id
 UNION ALL SELECT 'legacy_assessment_records_to_reconcile','P1',sec.site_id,count(*) FROM public.assessments a JOIN public.sections sec ON sec.id=a.section_id GROUP BY sec.site_id
 UNION ALL SELECT 'legacy_submission_records_to_reconcile','P1',sec.site_id,count(*) FROM public.submissions sub JOIN public.assessments a ON a.id=sub.assessment_id JOIN public.sections sec ON sec.id=a.section_id GROUP BY sec.site_id
 UNION ALL SELECT 'legacy_grade_records_to_reconcile','P1',sec.site_id,count(*) FROM public.section_grades g JOIN public.sections sec ON sec.id=g.section_id GROUP BY sec.site_id
 UNION ALL SELECT 'legacy_schedule_records_to_reconcile','P1',sec.site_id,count(*) FROM public.scheduled_occurrences so JOIN public.sections sec ON sec.id=so.section_id GROUP BY sec.site_id
 UNION ALL SELECT 'legacy_progress_records_to_reconcile','P1',sec.site_id,count(*) FROM public.lesson_progress lp JOIN public.sections sec ON sec.id=lp.section_id GROUP BY sec.site_id
 UNION ALL SELECT 'native_submission_course_mismatch','P0',c.site_id,count(*) FROM public.graded_submissions sub JOIN public.learner_course_attempts a ON a.id=sub.course_attempt_id JOIN public.class_enrollments ce ON ce.id=a.class_enrollment_id JOIN public.classes c ON c.id=ce.class_id JOIN public.graded_assignments ga ON ga.id=sub.assignment_id WHERE sub.course_version_id IS DISTINCT FROM a.course_version_id OR ga.course_version_id IS DISTINCT FROM a.course_version_id OR c.course_version_id IS DISTINCT FROM a.course_version_id GROUP BY c.site_id
 UNION ALL SELECT 'native_progress_course_mismatch','P0',c.site_id,count(*) FROM public.learner_lesson_progress lp JOIN public.learner_course_attempts a ON a.id=lp.course_attempt_id JOIN public.class_enrollments ce ON ce.id=a.class_enrollment_id JOIN public.classes c ON c.id=ce.class_id JOIN public.course_lessons l ON l.id=lp.lesson_id WHERE lp.course_version_id IS DISTINCT FROM a.course_version_id OR l.course_version_id IS DISTINCT FROM a.course_version_id OR c.course_version_id IS DISTINCT FROM a.course_version_id GROUP BY c.site_id
 UNION ALL SELECT 'active_grant_account_person_mismatch','P0',g.site_id,count(*) FROM public.account_person_grants g JOIN public.access_accounts a ON a.id=g.account_id WHERE g.active AND a.person_id IS DISTINCT FROM g.person_id GROUP BY g.site_id
 UNION ALL SELECT 'active_grant_site_org_mismatch','P0',g.site_id,count(*) FROM public.account_person_grants g JOIN public.sites s ON s.id=g.site_id WHERE g.active AND g.organization_id IS DISTINCT FROM s.organization_id GROUP BY g.site_id
 UNION ALL SELECT 'active_grant_disabled_principal','P0',g.site_id,count(*) FROM public.account_person_grants g JOIN public.access_accounts a ON a.id=g.account_id JOIN public.people pe ON pe.id=g.person_id WHERE g.active AND (a.disabled OR NOT pe.active) GROUP BY g.site_id
 UNION ALL SELECT 'site_lifecycle_unclassified','P1',id,1::bigint FROM public.sites WHERE lifecycle_status IS NULL
 UNION ALL SELECT 'site_geography_reference_missing','P1',s.id,1::bigint FROM public.sites s WHERE NOT EXISTS (SELECT 1 FROM public.site_geography_versions v WHERE v.site_id=s.id AND v.organization_id=s.organization_id AND v.superseded_at IS NULL)
 UNION ALL SELECT 'site_organization_lifecycle_unclassified','P1',s.id,1::bigint FROM public.sites s JOIN public.organizations o ON o.id=s.organization_id WHERE o.lifecycle_status IS NULL
 UNION ALL SELECT 'organization_lifecycle_unclassified','P1',NULL::uuid,count(*) FROM public.organizations WHERE lifecycle_status IS NULL HAVING count(*)>0
)
SELECT f.code,f.priority,f.site_id,s.name AS site_name,f.affected::int
FROM findings f LEFT JOIN public.sites s ON s.id=f.site_id
ORDER BY f.priority,f.code,f.site_id;
