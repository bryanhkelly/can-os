-- Read-only acceptance for synthetic Valor V6.1 Class and Jordan homework.
-- Legacy Section and Cohort records are not queried.
WITH target AS (
 SELECT id AS site_id,organization_id FROM public.sites
 WHERE id='f1000000-0000-4000-8000-000000000003'::uuid
 AND metadata @> '{"synthetic":true}'::jsonb
), target_classes AS (
 SELECT c.* FROM public.classes c JOIN target t ON c.site_id=t.site_id
 WHERE c.deployment_id=md5('valor-v61:deployment')::uuid
), jordan AS (
 SELECT ce.*,c.course_version_id FROM public.class_enrollments ce
 JOIN target_classes c ON ce.class_id=c.id
 WHERE ce.learner_person_id='f1000000-0000-4000-8000-000000000005'::uuid
), jordan_attempts AS (
 SELECT j.*,lca.id AS verified_attempt_id FROM jordan j
 JOIN public.learner_course_attempts lca
   ON lca.id=j.course_attempt_id
   AND lca.class_enrollment_id=j.id
   AND lca.course_version_id=j.course_version_id
   AND lca.status='active'
), authority AS (
 SELECT c.id FROM target_classes c
 JOIN public.course_versions cv ON cv.id=c.course_version_id
 JOIN public.offering_versions ov ON ov.id=c.offering_version_id
 JOIN public.program_deployments dep ON dep.id=c.deployment_id
 JOIN public.education_operations op ON op.id=dep.operation_id
 JOIN public.deployment_offering_adoptions ado ON ado.id=c.adoption_id
 JOIN public.education_operation_organization_roles opr ON opr.operation_id=op.id
   AND opr.organization_id=c.operating_organization_id AND opr.role_code='operator'
   AND opr.status='approved' AND opr.valid_from<=now()
 JOIN public.site_organization_roles sor ON sor.site_id=c.site_id
   AND sor.organization_id=c.operating_organization_id AND sor.role_code='operator'
   AND sor.valid_from<=now()
 JOIN public.deployment_sites ds ON ds.deployment_id=c.deployment_id
   AND ds.site_id=c.site_id
 WHERE c.state='active' AND cv.lifecycle='published' AND ov.lifecycle='published'
   AND dep.status='active' AND op.status='active' AND ado.approval_status='approved'
), homework AS (
 SELECT ga.id FROM public.graded_assignments ga
 JOIN public.course_versions cv ON cv.id=ga.course_version_id
 WHERE cv.syllabus->>'source'='valor-2026-original-curriculum' AND ga.section_id IS NULL
)
SELECT
 (SELECT count(*)::int FROM target_classes WHERE state='active') AS active_classes,
 (SELECT count(*)::int FROM authority) AS classes_with_authority,
 (SELECT count(*)::int FROM jordan WHERE status='active') AS jordan_active_enrollments,
 (SELECT count(*)::int FROM jordan_attempts WHERE status='active') AS jordan_course_attempts,
 (SELECT count(*)::int FROM jordan WHERE status='withdrawn') AS preserved_withdrawals,
 (SELECT count(*)::int FROM homework) AS catalog_homework_assignments,
 (SELECT count(*)::int FROM public.graded_submissions gs JOIN jordan_attempts ja ON gs.course_attempt_id=ja.verified_attempt_id WHERE gs.status='assigned') AS jordan_assigned_homework,
 (SELECT count(*)::int FROM public.course_lessons l JOIN public.course_versions cv ON cv.id=l.course_version_id
 WHERE cv.syllabus->>'source'='valor-2026-original-curriculum') AS lesson_count,
 (SELECT count(*)::int FROM public.class_offering_versions cov JOIN target_classes c ON c.id=cov.class_id WHERE cov.state='published') AS published_class_terms,
 (SELECT count(*)::int FROM public.class_sessions cs JOIN target_classes c ON c.id=cs.class_id) AS scheduled_sessions;
