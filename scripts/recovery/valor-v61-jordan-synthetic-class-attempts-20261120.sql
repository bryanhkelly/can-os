-- Exact synthetic Valor site and synthetic Jordan Person only.
-- One-time activation of existing assigned demo placements; no legal consent,
-- academic credit, guardian authorization or new Sections/Cohorts.
DO $jordan_activation$
DECLARE
  sid CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
  org CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
  jordan CONSTANT uuid := 'f1000000-0000-4000-8000-000000000005';
  dep CONSTANT uuid := md5('valor-v61:deployment')::uuid;
  rec RECORD;
  attempt_id uuid;
  activated integer := 0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=sid AND organization_id=org
    AND metadata @> '{"synthetic":true}'::jsonb AND lifecycle_status='active')
    OR NOT EXISTS(SELECT 1 FROM public.people WHERE id=jordan AND active
      AND metadata @> '{"synthetic":true}'::jsonb)
    OR NOT EXISTS(SELECT 1 FROM public.account_person_grants g
      JOIN public.access_accounts a ON a.id=g.account_id
      WHERE g.person_id=jordan AND g.active=true
       AND g.role='student' AND g.site_id=sid AND g.organization_id=org
       AND a.email_normalized='jordan.student@valorschool.demo'
       AND a.disabled=false AND a.email_verified_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Jordan synthetic student identity and Site preconditions not met';
  END IF;
  IF (SELECT count(*) FROM public.class_enrollments ce
      JOIN public.classes c ON c.id=ce.class_id
      WHERE ce.learner_person_id=jordan AND c.site_id=sid
      AND c.deployment_id=dep AND ce.status='pending')<>9
    THEN RAISE EXCEPTION 'Unexpected count of restored pending Jordan class placements';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.class_enrollments ce
    JOIN public.classes c ON c.id=ce.class_id
    JOIN public.course_versions cv ON cv.id=c.course_version_id
    JOIN public.deployment_offering_adoptions oa ON oa.id=c.adoption_id
    WHERE ce.learner_person_id=jordan AND ce.status='pending'
      AND (c.site_id<>sid OR c.deployment_id<>dep OR c.state<>'active'
      OR cv.lifecycle<>'published' OR oa.approval_status<>'approved')
  ) THEN RAISE EXCEPTION 'Class/source publication mismatch'; END IF;
  FOR rec IN
    SELECT ce.id AS enrollment_id,c.id AS class_id,c.deployment_id,
      c.adoption_id,c.offering_version_id,c.course_version_id
    FROM public.class_enrollments ce
    JOIN public.classes c ON c.id=ce.class_id
    WHERE ce.learner_person_id=jordan AND c.site_id=sid
      AND c.deployment_id=dep AND ce.status='pending'
    ORDER BY c.id
  LOOP
    attempt_id:=md5('valor-v61:jordan-attempt:'||rec.enrollment_id::text)::uuid;
    -- Native DB trigger requires the Class Enrollment active before an
    -- attempted lesson record can be created. Preserve the same Enrollment ID.
    UPDATE public.class_enrollments SET status='active'
      WHERE id=rec.enrollment_id AND status='pending' AND course_attempt_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Jordan pending status transition conflicted'; END IF;
    INSERT INTO public.learner_course_attempts
      (id,class_enrollment_id,enrollment_id,noncredit_registration_id,
       deployment_id,adoption_id,offering_version_id,course_version_id,
       section_id,attempt_no,status)
    VALUES
      (attempt_id,rec.enrollment_id,NULL,NULL,rec.deployment_id,rec.adoption_id,
       rec.offering_version_id,rec.course_version_id,NULL,1,'active')
    ON CONFLICT(id) DO NOTHING;
    UPDATE public.class_enrollments SET course_attempt_id=attempt_id
     WHERE id=rec.enrollment_id AND status='active' AND course_attempt_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Jordan Class Enrollment activation conflicted'; END IF;
    activated:=activated+1;
  END LOOP;
  IF activated<>9 OR (SELECT count(*) FROM public.class_enrollments ce
    JOIN public.classes c ON c.id=ce.class_id
    WHERE ce.learner_person_id=jordan AND c.site_id=sid
      AND c.deployment_id=dep AND ce.status='active' AND ce.course_attempt_id IS NOT NULL)<>9
    THEN RAISE EXCEPTION 'Jordan Course Attempt activation incomplete';
  END IF;
END $jordan_activation$
