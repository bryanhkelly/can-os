-- Valor V6.1 synthetic fixture acceptance check.
-- Read-only. Uses canonical Course/Class/Enrollment objects only.
-- Does not create Sections, Cohorts, publishing approvals, or credentials.
DO $verify_valor$
DECLARE
  v_courses integer; v_versions integer; v_units integer; v_lessons integer;
  v_classes integer; v_enrollments integer; v_attributions integer; v_videos integer;
  v_site uuid := 'f1000000-0000-4000-8000-000000000003'::uuid;
  v_org uuid := 'f1000000-0000-4000-8000-000000000002'::uuid;
  v_deployment uuid := md5('valor-v61:deployment')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=v_site AND metadata @> '{"synthetic":true}'::jsonb) THEN
    RAISE EXCEPTION 'Valor synthetic Site not found';
  END IF;
  SELECT count(*) INTO v_courses FROM public.courses
    WHERE publisher_organization_id=v_org AND course_code IN
      ('ALG-S','BIO-S','CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST',
       'ENG-CR-01','ENG-S','HIS-S','HR-S','PHOTO-S','SPAN-S');
  SELECT count(*) INTO v_versions FROM public.course_versions cv
    WHERE cv.course_id IN (SELECT c.id FROM public.courses c
      WHERE c.publisher_organization_id=v_org AND
        c.course_code IN ('ALG-S','BIO-S','CAN-ALG1','CAN-BIO','CAN-ENG9',
        'CAN-USHIST','ENG-CR-01','ENG-S','HIS-S','HR-S','PHOTO-S','SPAN-S'))
      AND cv.syllabus->>'source'='valor-2026-original-curriculum';
  SELECT count(*) INTO v_units FROM public.course_units u
    JOIN public.course_versions cv ON cv.id=u.course_version_id
    WHERE cv.syllabus->>'source'='valor-2026-original-curriculum';
  SELECT count(*) INTO v_lessons FROM public.course_lessons l
    WHERE l.content->>'source'='valor-v61-rehydration';
  SELECT count(*) INTO v_classes FROM public.classes
    WHERE site_id=v_site AND deployment_id=v_deployment;
  SELECT count(*) INTO v_enrollments FROM public.class_enrollments ce
    JOIN public.classes c ON c.id=ce.class_id
    WHERE c.site_id=v_site AND c.deployment_id=v_deployment;
  SELECT count(*) INTO v_attributions FROM public.participation_attributions a
    JOIN public.class_enrollments ce ON ce.id=a.class_enrollment_id
    JOIN public.classes c ON c.id=ce.class_id
    WHERE c.site_id=v_site AND c.deployment_id=v_deployment;
  SELECT count(*) INTO v_videos FROM public.course_lessons l
    JOIN public.course_versions cv ON cv.id=l.course_version_id
    WHERE cv.syllabus->>'source'='valor-2026-original-curriculum'
      AND jsonb_array_length(COALESCE(l.content->'videoResources','[]'::jsonb))>0;
  IF v_courses<12 OR v_versions<12 OR v_units<48 OR v_lessons<746
     OR v_classes<12 OR v_enrollments<131 OR v_attributions<131 OR v_videos<12 THEN
    RAISE EXCEPTION
      'Valor fixture incomplete: courses %, versions %, units %, lessons %, classes %, placements %, attributions %, videos %',
      v_courses,v_versions,v_units,v_lessons,v_classes,v_enrollments,v_attributions,v_videos;
  END IF;
  RAISE NOTICE 'Valor native fixture OK: % courses / % versions / % units / % lessons / % classes / % placements / % attributed / % media-ready',
    v_courses,v_versions,v_units,v_lessons,v_classes,v_enrollments,v_attributions,v_videos;
END $verify_valor$;

SELECT 'valor_v61' fixture,
  count(*) classes,
  count(*) FILTER (WHERE state='active') active_classes
FROM public.classes
WHERE site_id='f1000000-0000-4000-8000-000000000003'
  AND deployment_id=md5('valor-v61:deployment')::uuid;
