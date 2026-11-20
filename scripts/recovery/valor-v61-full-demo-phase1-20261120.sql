-- CAN OS Valor V6.1 full synthetic demo: Phase 1, connected rosters and teaching staff.
-- Idempotent, atomic; additive to canonical tables and existing synthetic assignments.
-- Historical legacy Sections/Cohorts are NOT used as destination or foreign keys.
-- IMPORTANT: this records synthetic simulated training participation, not actual
-- parent legal consent, school authorization or academic credit.
DO $valor_full_roster$
DECLARE
 v_site CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
 v_org CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
 v_dep CONSTANT uuid := md5('valor-v61:deployment')::uuid;
 v_riley CONSTANT uuid := 'f1000000-0000-4000-8000-000000000006';
 v_alex CONSTANT uuid := 'f7000000-0000-4000-8000-000000000001';
 v_sally CONSTANT uuid := 'f7200000-0000-4000-8000-000000000001';
 v_selected integer;
 v_matching integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=v_site AND organization_id=v_org
      AND metadata @> '{"synthetic":true}'::jsonb AND lifecycle_status='active') THEN
    RAISE EXCEPTION 'Valor synthetic Site identity guard failed';
  END IF;
  IF (SELECT count(*) FROM public.classes WHERE site_id=v_site AND deployment_id=v_dep
    AND state='active') <> 12 THEN
    RAISE EXCEPTION 'Expected exactly twelve active canonical Valor Classes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id=v_riley
    AND active AND metadata @> '{"synthetic":true}'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM public.people WHERE id=v_alex
    AND active AND metadata @> '{"synthetic":true}'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM public.people WHERE id=v_sally
    AND active AND metadata @> '{"synthetic":true}'::jsonb) THEN
    RAISE EXCEPTION 'Synthetic Valor staff identity changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.account_person_grants g
    JOIN public.access_accounts a ON a.id=g.account_id
    WHERE g.person_id=v_riley AND g.role='teacher' AND g.organization_id=v_org
      AND g.site_id=v_site AND g.active=true AND a.disabled=false
      AND a.email_verified_at IS NOT NULL
      AND a.email_normalized='riley.teacher@valorschool.demo'
  ) THEN RAISE EXCEPTION 'Riley verified synthetic teacher login is missing'; END IF;

  -- Exactly 20 pre-existing 2026 fixture learners, six site placements each.
  -- Do not touch the unrelated admissions test Person or any actual student.
  SELECT count(*) INTO v_selected FROM public.student_profiles sp
  JOIN public.people p ON p.id=sp.person_id
  WHERE sp.student_number IN(SELECT 'V26-'||n::text FROM generate_series(101,120)n)
    AND p.id::text LIKE 'fd7b0000-%' AND p.active;
  IF v_selected <> 20 THEN RAISE EXCEPTION 'V26 synthetic roster identity count changed: %',v_selected; END IF;
  SELECT count(*) INTO v_matching FROM public.class_enrollments e
  JOIN public.classes c ON c.id=e.class_id
  JOIN public.student_profiles sp ON sp.person_id=e.learner_person_id
  WHERE c.site_id=v_site AND c.deployment_id=v_dep
    AND sp.student_number IN(SELECT 'V26-'||n::text FROM generate_series(101,120)n)
    AND e.enrollment_method='assignment' AND e.credit_mode='not_applicable'
    AND e.status IN('pending','active');
  IF v_matching<>120 THEN RAISE EXCEPTION 'Expected 120 synthetic V26 placements, found %',v_matching; END IF;

  UPDATE public.people p
  SET metadata=p.metadata||jsonb_build_object('synthetic',true,
    'fixtureSource','valor-v26-existing-cohortless-roster',
    'fixtureScope','test_only','creditAuthorization',false)
  FROM public.student_profiles sp
  WHERE p.id=sp.person_id AND p.id::text LIKE 'fd7b0000-%'
    AND sp.student_number IN(SELECT 'V26-'||n::text FROM generate_series(101,120)n)
    AND NOT(p.metadata @> '{"synthetic":true,"fixtureScope":"test_only"}'::jsonb);

  UPDATE public.student_profiles sp
  SET metadata=sp.metadata||'{"synthetic":true,"fixtureScope":"test_only"}'::jsonb
  WHERE sp.student_number IN(SELECT 'V26-'||n::text FROM generate_series(101,120)n)
    AND sp.person_id::text LIKE 'fd7b0000-%'
    AND NOT(sp.metadata @> '{"synthetic":true,"fixtureScope":"test_only"}'::jsonb);

  -- Preserve guardian links but clearly label them as simulated, NOT legal
  -- parental verification for academic placement or consent.
  UPDATE public.guardian_relationships gr
  SET metadata=gr.metadata||'{"synthetic":true,"simulatedRelationship":true,"notLegalEvidence":true,"fixtureScope":"valor-v61"}'::jsonb
  FROM public.student_profiles sp
  WHERE gr.student_person_id=sp.person_id
    AND sp.student_number IN(SELECT 'V26-'||n::text FROM generate_series(101,120)n)
    AND sp.person_id::text LIKE 'fd7b0000-%'
    AND gr.guardian_person_id::text LIKE 'fd7d0000-%'
    AND NOT(gr.metadata @> '{"synthetic":true,"fixtureScope":"valor-v61"}'::jsonb);

  -- Teacher covers all subject Classes for a rich synthetic staff workspace.
  -- Staff grant DOES NOT substitute for an authenticated professional role or
  -- any runtime review/permission check.
  INSERT INTO public.class_staff_assignments
    (id,class_id,person_id,role_code,attendance_authorized,state,begins_at,assigned_by_person_id)
  SELECT md5('valor-v61:staff:riley:'||c.id::text)::uuid,c.id,v_riley,'teacher',
    false,'approved','2026-11-20T00:00:00Z',v_alex
  FROM public.classes c WHERE c.site_id=v_site AND c.deployment_id=v_dep
  ON CONFLICT (id) DO NOTHING;

  -- Explicit denied/suspended facilitator scenario; Sally's legacy access
  -- email is not verified, so no new active facilitation is authorized.
  INSERT INTO public.class_staff_assignments
    (id,class_id,person_id,role_code,attendance_authorized,state,begins_at,assigned_by_person_id)
  SELECT md5('valor-v61:staff:sally-suspended:'||c.id::text)::uuid,c.id,
    v_sally,'facilitator',false,'suspended','2026-11-20T00:00:00Z',v_alex
  FROM public.classes c WHERE c.site_id=v_site AND c.deployment_id=v_dep
    AND c.title='Homeroom'
  ON CONFLICT (id) DO NOTHING;

  -- Four V26 students (117..120) remain pending to test admissions;
  -- one unrelated admissions fixture stays untouched. Activate only
  -- verified synthetic fixture identities 101..116 and existing assignment
  -- enrollment, preserving the original enrollment ID/provenance.
  UPDATE public.class_enrollments e SET status='active'
  FROM public.classes c,public.student_profiles sp
  WHERE e.class_id=c.id AND e.learner_person_id=sp.person_id
    AND c.site_id=v_site AND c.deployment_id=v_dep AND c.state='active'
    AND sp.student_number IN(SELECT 'V26-'||n::text FROM generate_series(101,116)n)
    AND sp.person_id::text LIKE 'fd7b0000-%'
    AND e.status='pending' AND e.course_attempt_id IS NULL
    AND e.enrollment_method='assignment' AND e.credit_mode='not_applicable';

  -- Course Attempt source trigger requires ACTIVE enrollment *before* INSERT.
  INSERT INTO public.learner_course_attempts
    (id,class_enrollment_id,enrollment_id,noncredit_registration_id,
     deployment_id,adoption_id,offering_version_id,course_version_id,
     section_id,attempt_no,status,started_at)
  SELECT md5('valor-v61:v26:attempt:'||e.id::text)::uuid,e.id,NULL,NULL,
    c.deployment_id,c.adoption_id,c.offering_version_id,c.course_version_id,
    NULL,1,'active',GREATEST(e.enrolled_at,'2026-11-03T00:00:00Z'::timestamptz)
  FROM public.class_enrollments e
  JOIN public.classes c ON c.id=e.class_id
  JOIN public.student_profiles sp ON sp.person_id=e.learner_person_id
  WHERE c.site_id=v_site AND c.deployment_id=v_dep AND e.status='active'
    AND sp.student_number IN(SELECT 'V26-'||n::text FROM generate_series(101,116)n)
    AND sp.person_id::text LIKE 'fd7b0000-%'
    AND e.course_attempt_id IS NULL
  ON CONFLICT(id) DO NOTHING;

  UPDATE public.class_enrollments e SET course_attempt_id=a.id
  FROM public.learner_course_attempts a
  JOIN public.student_profiles sp ON a.class_enrollment_id IS NOT NULL
  JOIN public.classes c ON c.id=(SELECT ce.class_id FROM public.class_enrollments ce
    WHERE ce.id=a.class_enrollment_id)
  WHERE e.id=a.class_enrollment_id AND e.learner_person_id=sp.person_id
    AND sp.student_number IN(SELECT 'V26-'||n::text FROM generate_series(101,116)n)
    AND sp.person_id::text LIKE 'fd7b0000-%'
    AND e.course_attempt_id IS NULL AND e.status='active'
    AND c.site_id=v_site AND c.deployment_id=v_dep
    AND a.id=md5('valor-v61:v26:attempt:'||e.id::text)::uuid;

  IF (SELECT count(*) FROM public.class_enrollments e
      JOIN public.student_profiles sp ON sp.person_id=e.learner_person_id
      JOIN public.classes c ON c.id=e.class_id
      WHERE c.site_id=v_site AND c.deployment_id=v_dep AND e.status='active'
        AND e.course_attempt_id IS NOT NULL
        AND sp.student_number IN(SELECT 'V26-'||n::text FROM generate_series(101,116)n)
        AND sp.person_id::text LIKE 'fd7b0000-%')<>96 THEN
    RAISE EXCEPTION 'Expected 96 active synthetic V26 Class placements with Course Attempts';
  END IF;
END $valor_full_roster$;
