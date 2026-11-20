-- Valor School synthetic noncredit activation, exact Site and Organization only.
-- IMPORTANT: this enables test participants, not a legally accredited school.
-- DO NOT run for any nonsynthetic tenant. It uses test-scoped publication and
-- approval values to exercise Class discovery/learning; no academic credit.
-- Idempotent. Writes use one atomic PL/pgSQL statement. No Sections/Cohorts created.
DO $valor_test_release$
DECLARE
  sid constant uuid := 'f1000000-0000-4000-8000-000000000003';
  org constant uuid := 'f1000000-0000-4000-8000-000000000002';
  actor constant uuid := 'f7000000-0000-4000-8000-000000000001';
  op constant uuid := md5('valor-v61:operation')::uuid;
  dep constant uuid := md5('valor-v61:deployment')::uuid;
  ov constant uuid := md5('valor-v61:offeringversion')::uuid;
  ad constant uuid := md5('valor-v61:adoption')::uuid;
  rec record;
  assign_key text; hwtitle text; instructions text; official_id uuid;
  class_offering_id uuid; class_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=sid AND organization_id=org AND metadata @> '{"synthetic":true}'::jsonb)
     OR (SELECT count(*) FROM public.classes WHERE site_id=sid AND deployment_id=dep)<>12
     OR NOT EXISTS(SELECT 1 FROM public.people WHERE id=actor AND metadata @> '{"synthetic":true}'::jsonb) THEN
     RAISE EXCEPTION 'Valor synthetic rehydration guard failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.classes WHERE site_id=sid AND deployment_id<>dep AND state='active') THEN
    RAISE EXCEPTION 'Unexpected non-demo active Valor Classes';
  END IF;
  FOR rec IN
    SELECT cv.id version_id,c.course_code,c.title
    FROM public.courses c JOIN public.course_versions cv ON cv.course_id=c.id
    WHERE c.publisher_organization_id=org AND cv.syllabus->>'source'='valor-2026-original-curriculum'
    ORDER BY c.course_code
  LOOP
    FOR assign_key IN SELECT unnest(ARRAY['practice-01','reflection-01'])
    LOOP
      IF assign_key='practice-01' THEN
        hwtitle:='Unit 1 practice · '||rec.title;
        instructions:='Review the opening lesson in '||rec.title||
          '. Write at least one paragraph explaining an important concept, provide a concrete example, and describe how you would check whether your answer is correct. This is a synthetic noncredit homework exercise.';
      ELSE
        hwtitle:='Learning reflection · '||rec.title;
        instructions:='Describe what you learned in '||rec.title||
          ', identify one question you still have, and give an example of a credible source or piece of evidence you could use next. This is a synthetic noncredit homework exercise.';
      END IF;
      official_id:=md5('valor-v61:official-homework:'||rec.course_code||':'||assign_key)::uuid;
      INSERT INTO public.official_course_assignment_versions
        (id,course_version_id,assignment_key,official_spec,rubric,required,weight)
      VALUES(official_id,rec.version_id,assign_key,
        jsonb_build_object('title',hwtitle,'instructions',instructions,'synthetic',true,
          'creditMode','not_applicable','reviewStatus','demo_only'),
        '{"synthetic":true,"maxPoints":10,"criteria":["response completeness","concrete example","reasoning"]}'::jsonb,
        false,0)
      ON CONFLICT(id) DO NOTHING;
      INSERT INTO public.graded_assignments
        (id,section_id,course_version_id,official_assignment_version_id,assignment_key,version_no,assignment_spec)
      VALUES(md5('valor-v61:homework:'||rec.course_code||':'||assign_key)::uuid,
        NULL,rec.version_id,official_id,assign_key,1,
        jsonb_build_object('title',hwtitle,'instructions',instructions,'synthetic',true,
          'submissionType','text','creditMode','not_applicable'))
      ON CONFLICT(id) DO NOTHING;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM public.graded_assignments a JOIN public.course_versions cv ON cv.id=a.course_version_id
      WHERE cv.syllabus->>'source'='valor-2026-original-curriculum' AND a.section_id IS NULL)<>24 THEN
    RAISE EXCEPTION 'Expected exactly 24 canonical synthetic homework assignments';
  END IF;
  INSERT INTO public.offering_release_requirements(id,offering_version_id,course_version_id,
    minimum_approved_primary_tracks,complete_lesson_coverage_required,
    independent_academic_review_required,rights_clearance_required,accessibility_review_required)
  SELECT md5('valor-v61:release-requirement:'||c.course_code)::uuid,ov,cv.id,
    0,false,false,false,false
  FROM public.courses c JOIN public.course_versions cv ON cv.course_id=c.id
  WHERE c.publisher_organization_id=org AND cv.syllabus->>'source'='valor-2026-original-curriculum'
  ON CONFLICT(id) DO NOTHING;
  UPDATE public.course_versions cv SET lifecycle='published',published_at=now()
  FROM public.courses c
  WHERE cv.course_id=c.id AND c.publisher_organization_id=org
    AND cv.syllabus->>'source'='valor-2026-original-curriculum' AND cv.lifecycle='draft';
  UPDATE public.offering_versions SET lifecycle='published',published_at=now()
  WHERE id=ov AND lifecycle='draft';
  UPDATE public.sites SET lifecycle_status='active'
  WHERE id=sid AND metadata @> '{"synthetic":true}'::jsonb
    AND lifecycle_status IS DISTINCT FROM 'active';
  INSERT INTO public.site_organization_roles
    (id,site_id,organization_id,role_code,valid_from)
  VALUES(md5('valor-v61:site-org-role')::uuid,sid,org,'operator','2026-11-20T00:00:00Z')
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.education_operation_organization_roles
    (id,operation_id,organization_id,role_code,valid_from,status)
  VALUES(md5('valor-v61:operation-operator-role')::uuid,op,org,'operator',
    '2026-11-20T00:00:00Z','approved')
  ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.deployment_sites(id,deployment_id,site_id,purpose)
  VALUES(md5('valor-v61:deployment-site')::uuid,dep,sid,'instruction')
  ON CONFLICT(id) DO NOTHING;
  UPDATE public.education_operations SET status='active' WHERE id=op AND status='planning';
  UPDATE public.program_deployments SET status='active' WHERE id=dep AND status='planning';
  UPDATE public.deployment_offering_adoptions
  SET approval_status='approved',approved_by_person_id=actor,approved_at=now()
  WHERE id=ad AND approval_status='proposed';
  FOR rec IN
    SELECT c.id,c.title,co.course_code
    FROM public.classes c JOIN public.course_versions cv ON cv.id=c.course_version_id
    JOIN public.courses co ON co.id=cv.course_id
    WHERE c.site_id=sid AND c.deployment_id=dep
    ORDER BY co.course_code
  LOOP
    class_id:=rec.id;
    class_offering_id:=md5('valor-v61:class-offering:'||rec.course_code)::uuid;
    INSERT INTO public.class_offerings(id,class_id)
    VALUES(class_offering_id,class_id) ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.class_offering_versions(id,class_offering_id,class_id,version_no,
      visibility,enrollment_methods,state,opens_at,closes_at,capacity,allowed_credit_modes,
      consent_version,consent_text,created_by_person_id,published_at)
    VALUES(md5('valor-v61:class-offering-version:'||rec.course_code)::uuid,
      class_offering_id,class_id,1,'unlisted',ARRAY['self']::text[],
      'published','2026-11-20T00:00:00Z',NULL,30,ARRAY['not_applicable']::text[],
      'valor-demo-v1',
      'I understand that this is a synthetic CAN OS demonstration. It is not enrollment in a real school, does not grant credit, and does not represent parental or guardian legal consent.',
      actor,now())
    ON CONFLICT(id) DO NOTHING;
  END LOOP;
  UPDATE public.classes SET title=CASE
    WHEN course_version_id=md5('valor-v61:courseversion:CAN-BIO')::uuid THEN 'Biology · CAN Standard'
    WHEN course_version_id=md5('valor-v61:courseversion:BIO-S')::uuid THEN 'Biology · Foundations'
    ELSE title END, delivery_mode='self_paced',state='active',updated_at=now()
  WHERE site_id=sid AND deployment_id=dep AND state='draft'
    AND NOT EXISTS(SELECT 1 FROM public.class_sessions cs WHERE cs.class_id=public.classes.id);
  IF (SELECT count(*) FROM public.classes WHERE site_id=sid AND deployment_id=dep AND state='active')<>12
    OR (SELECT count(*) FROM public.class_offering_versions cov WHERE cov.class_id IN
      (SELECT cls.id FROM public.classes cls WHERE cls.site_id=sid AND cls.deployment_id=dep)
      AND cov.state='published')<>12 THEN
    RAISE EXCEPTION 'Synthetic Valor Class/Offering release count mismatch';
  END IF;
END $valor_test_release$
