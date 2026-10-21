-- Read-only regression gate for CAN OS ValorSchool Algebra I synthetic rollout.
-- Never infer school credit, browser authentication or teacher grading service success from this report.
-- Scoped to the existing synthetic school and its Algebra I section.
WITH expected AS (
  SELECT s.id AS section_id,s.program_id,s.course_template_version_id,v.curriculum,s.metadata
  FROM sections s JOIN course_template_versions v ON v.id=s.course_template_version_id
  JOIN programs p ON p.id=s.program_id
  JOIN organizations o ON o.id=p.organization_id
  WHERE s.id='7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0' AND p.id='f1000000-0000-4000-8000-000000000004'
    AND o.id='f1000000-0000-4000-8000-000000000002' AND o.slug='can-synthetic-demo'
    AND o.metadata->>'synthetic'='true' AND s.metadata->>'synthetic'='true'
), checks AS (
  SELECT 'synthetic_scope'::text AS check_name, (EXISTS (SELECT 1 FROM expected)) AS passed
  UNION ALL
  SELECT 'class_uses_v2'::text AS check_name, (EXISTS (SELECT 1 FROM expected WHERE course_template_version_id=md5('can-core-version:CAN-ALG1:week01:v2')::uuid)) AS passed
  UNION ALL
  SELECT 'previous_course_retained'::text AS check_name, (EXISTS (SELECT 1 FROM course_template_versions v WHERE v.id='bf36382c-1a56-484b-72e1-a037d3203626' AND v.version=1 AND v.status='published')) AS passed
  UNION ALL
  SELECT 'five_structured_lessons'::text AS check_name, (EXISTS (SELECT 1 FROM expected e WHERE
 (SELECT COUNT(*) FROM jsonb_array_elements(e.curriculum->'learning'->'modules') m,
 jsonb_array_elements(m->'lessons') l WHERE l->>'id' LIKE 'u01-d%'
 AND jsonb_array_length(l->'activities')>=5)=5)) AS passed
  UNION ALL
  SELECT 'yearlong_plan_36_weeks'::text AS check_name, (EXISTS (SELECT 1 FROM expected e WHERE jsonb_array_length(e.curriculum->'learning'->'blueprint'->'weeks')=36)) AS passed
  UNION ALL
  SELECT 'credit_not_ready'::text AS check_name, (EXISTS (SELECT 1 FROM expected e WHERE e.curriculum->'learning'->'blueprint'->>'creditStatus'='not_credit_ready')) AS passed
  UNION ALL
  SELECT 'teacher_guide_is_separate'::text AS check_name, (EXISTS (SELECT 1 FROM expected e WHERE e.curriculum->'teacherGuides'->>'visibility'='teacher_only'
 AND e.curriculum->'learning'->'teacherGuides' IS NULL
 AND (SELECT COUNT(*) FROM jsonb_array_elements(e.curriculum->'teacherGuides'->'units') u,
 jsonb_array_elements(u->'lessons') l)=5)) AS passed
  UNION ALL
  SELECT 'active_pack_v2'::text AS check_name, (EXISTS (SELECT 1 FROM curriculum_adoptions a JOIN curriculum_entitlements et ON et.pack_id=a.pack_id
 AND et.organization_id=a.organization_id WHERE a.program_id='f1000000-0000-4000-8000-000000000004' AND a.pack_version_id=md5('can-core-pack-version:week01:v2')::uuid
 AND a.status='active' AND et.status='active')) AS passed
  UNION ALL
  SELECT 'pack_items_32'::text AS check_name, ((SELECT COUNT(*) FROM curriculum_pack_items i WHERE i.pack_version_id=md5('can-core-pack-version:week01:v2')::uuid)=32) AS passed
  UNION ALL
  SELECT 'pack_algebra1_v2_item'::text AS check_name, (EXISTS (SELECT 1 FROM curriculum_pack_items i WHERE i.pack_version_id=md5('can-core-pack-version:week01:v2')::uuid
 AND i.course_template_version_id=md5('can-core-version:CAN-ALG1:week01:v2')::uuid)) AS passed
  UNION ALL
  SELECT 'old_progress_preserved'::text AS check_name, (EXISTS (SELECT 1 FROM lesson_progress l WHERE l.section_id='7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0' AND l.course_template_version_id=md5('can-core-version:CAN-ALG1:week01:v2')::uuid
 AND l.lesson_id='variables' AND l.completed_at IS NOT NULL)) AS passed
  UNION ALL
  SELECT 'two_scored_assessments'::text AS check_name, ((SELECT COUNT(*) FROM assessments a WHERE a.section_id='7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0' AND a.status='published'
 AND a.metadata->>'unitId'='algebra1-u01' AND a.points_possible IN (20,30))=2) AS passed
  UNION ALL
  SELECT 'rubric_totals_match'::text AS check_name, ((SELECT COUNT(*) FROM assessments a WHERE a.section_id='7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0' AND a.metadata->>'unitId'='algebra1-u01'
 AND (SELECT SUM((criterion->>'maxPoints')::numeric)
 FROM jsonb_array_elements(a.metadata->'rubricCriteria') criterion)=a.points_possible)=2) AS passed
  UNION ALL
  SELECT 'synthetic_student_enrolled'::text AS check_name, (EXISTS (SELECT 1 FROM enrollments e WHERE e.section_id='7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0' AND e.kind='section'
 AND e.status='active' AND e.student_profile_id='f1000000-0000-4000-8000-000000000007'
 AND e.metadata->>'synthetic'='true')) AS passed
  UNION ALL
  SELECT 'no_real_students_changed'::text AS check_name, (NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.section_id='7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0'
 AND e.metadata->>'synthetic' IS DISTINCT FROM 'true')) AS passed
  UNION ALL
  SELECT 'assigned_demo_teacher'::text AS check_name, (EXISTS (SELECT 1 FROM section_teachers st
 JOIN account_person_grants g ON g.person_id=st.person_id AND g.role='teacher' AND g.active=true
 JOIN access_accounts acc ON acc.id=g.account_id AND acc.email_normalized='riley.teacher@valorschool.demo'
 WHERE st.section_id='7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0' AND st.person_id='f1000000-0000-4000-8000-000000000006')) AS passed
  UNION ALL
  SELECT 'activation_audited'::text AS check_name, (EXISTS (SELECT 1 FROM audit_events e WHERE e.id=md5('can-core-algebra1-week01-class-upgrade-audit')::uuid
 AND e.resource_id='7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0' AND e.action='curriculum.synthetic_pilot.week01_upgrade')) AS passed
  UNION ALL
  SELECT 'no_acceptance_submissions_left'::text AS check_name, (NOT EXISTS (SELECT 1 FROM submissions s JOIN assessments a ON a.id=s.assessment_id
 WHERE a.section_id='7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0' AND s.id=md5('can-alg1-week1-acceptance:'||a.id::text)::uuid)) AS passed
)
SELECT check_name,passed FROM checks ORDER BY check_name;
