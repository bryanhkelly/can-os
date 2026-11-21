-- One-Class, idempotent synthetic hybrid-delivery update. Neon main only.
-- Does not create Sessions, approvals, accounts, attendance, or Course Attempts.
DO $valor_biology_hybrid$
DECLARE
  target constant uuid := '26c4fa42-7f05-a9f0-eb63-6624dc7463d3';
  site constant uuid := 'f1000000-0000-4000-8000-000000000003';
  organization constant uuid := 'f1000000-0000-4000-8000-000000000002';
  riley constant uuid := 'f1000000-0000-4000-8000-000000000006';
  jordan constant uuid := 'f1000000-0000-4000-8000-000000000005';
  mode text;
BEGIN
  IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb'
  THEN RAISE EXCEPTION 'Valor hybrid fixture is pinned to CAN OS Neon main'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('can-os:valor-biology-hybrid-v61'));
  IF NOT EXISTS (
    SELECT 1 FROM public.sites s
    JOIN public.organizations o ON o.id=s.organization_id
    WHERE s.id=site AND s.organization_id=organization
      AND s.metadata @> '{"synthetic":true}'::jsonb
      AND o.metadata @> '{"synthetic":true}'::jsonb
  ) THEN RAISE EXCEPTION 'Valor tenant identity is not synthetic/expected'; END IF;
  SELECT c.delivery_mode INTO STRICT mode FROM public.classes c
  WHERE c.id=target AND c.site_id=site AND c.operating_organization_id=organization
    AND c.title='Biology · CAN Standard' AND c.state='active';
  IF mode NOT IN ('self_paced','hybrid') THEN
    RAISE EXCEPTION 'Unexpected Biology delivery state %',mode; END IF;
  IF (SELECT count(*) FROM public.class_enrollments e
      WHERE e.class_id=target AND e.status='active')<>11
    OR (SELECT count(*) FROM public.course_lessons l
        JOIN public.classes c ON c.course_version_id=l.course_version_id
        WHERE c.id=target)<>184
    OR (SELECT count(*) FROM public.class_enrollments e
        JOIN public.classes c ON c.id=e.class_id
        WHERE e.learner_person_id=jordan AND c.site_id=site
          AND e.status='active')<>9
    OR NOT EXISTS (
      SELECT 1 FROM public.class_staff_assignments sa
      WHERE sa.class_id=target AND sa.person_id=riley
        AND sa.role_code='teacher' AND sa.state='approved'
        AND sa.ends_at IS NULL AND sa.attendance_authorized=false
    )
  THEN RAISE EXCEPTION 'Valor academic data or Riley/Jordan baseline changed'; END IF;
  UPDATE public.classes SET delivery_mode='hybrid',updated_at=clock_timestamp()
  WHERE id=target AND delivery_mode='self_paced';
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id=target
    AND state='active' AND delivery_mode='hybrid') THEN
    RAISE EXCEPTION 'Biology hybrid update was not applied'; END IF;
  IF EXISTS (SELECT 1 FROM public.classes WHERE site_id=site AND id<>target
    AND delivery_mode<>'self_paced') THEN
    RAISE EXCEPTION 'Other Valor Class modes do not match this fixture baseline'; END IF;
END $valor_biology_hybrid$;
