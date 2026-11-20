-- ONE-TIME CAN OS Valor recovery, November 20, 2026.
-- Source: retired academic demo fixture in public.sections and associated tables.
-- Target: canonical Courses, Course Versions, Units, Lessons, Offering,
-- Deployment, Classes, Class Enrollments and participation attributions.
-- Never creates Sections or Cohorts. Do not add to normal migrations/seed chain.
-- Idempotent and atomic; requires exactly 12 synthetic historical course records.
-- Writes draft/proposed/planning state only: no school, Course, operator,
-- enrollment-release or accreditation authorization is conferred.
-- Reusable supplemental video links are teacher-review candidates only.
BEGIN;
DO $restore$
DECLARE
  rec record; u record; l record;
  modules jsonb; lessons jsonb;
  course_id uuid; course_version_id uuid; unit_id uuid;
  valor_site CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
  valor_org CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
  operator_person CONSTANT uuid:='f7000000-0000-4000-8000-000000000001';
  operation_id CONSTANT uuid:=md5('valor-v61:operation')::uuid;
  offering_id CONSTANT uuid:=md5('valor-v61:offering')::uuid;
  offering_version CONSTANT uuid:=md5('valor-v61:offeringversion')::uuid;
  deployment_id CONSTANT uuid:=md5('valor-v61:deployment')::uuid;
  adoption_id CONSTANT uuid:=md5('valor-v61:adoption')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=valor_site AND
    organization_id=valor_org AND metadata @> '{"synthetic":true}'::jsonb)
  THEN RAISE EXCEPTION 'Unexpected or non-synthetic Valor Site'; END IF;
  IF (SELECT count(*) FROM public.sections WHERE site_id=valor_site)<>12
  THEN RAISE EXCEPTION 'Valor legacy fixture changed; expected 12'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id=operator_person)
  THEN RAISE EXCEPTION 'Missing synthetic registrar Person'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.courses c JOIN public.sections s ON c.course_code=s.code
    WHERE s.site_id=valor_site AND c.publisher_organization_id=valor_org
      AND c.id<>md5('valor-v61:course:'||s.code)::uuid
  ) THEN RAISE EXCEPTION 'Conflicting preexisting native Course code'; END IF;

  INSERT INTO public.education_operations(id,code,name,kind_code,status,web_identity)
  VALUES(operation_id,'VALOR-V61-DEMO','Valor School | Synthetic Demonstration',
    'school','planning','{"synthetic":true,"demoOnly":true,"authorization":"not_approved"}'::jsonb)
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.education_operation_sites(id,operation_id,site_id,valid_from,purpose)
  VALUES(md5('valor-v61:operation-site')::uuid,operation_id,valor_site,
    '2026-11-20T00:00:00Z','synthetic planning only')
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.offerings(id,publisher_organization_id,code,title,origin,status)
  VALUES(offering_id,valor_org,'VALOR-V61-2026-DEMO',
    'Valor School 2026–27 Synthetic Learning','native','active')
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.offering_versions(id,offering_id,version_no,product_definition,lifecycle)
  VALUES(offering_version,offering_id,1,
    '{"synthetic":true,"demonstration":true,"forCredit":false,"authorization":"not_approved","instructionalReview":"required","source":"valor-v61-rehydration-20261120"}'::jsonb,
    'draft')
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.program_deployments(id,operation_id,offering_id,code,name,status)
  VALUES(deployment_id,operation_id,offering_id,'VALOR-2026-27-DEMO',
    'Valor School 2026–27 Learning | Demonstration','planning')
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.deployment_offering_adoptions
    (id,deployment_id,offering_id,offering_version_id,valid_from,approval_status)
  VALUES(adoption_id,deployment_id,offering_id,offering_version,
    '2026-11-20T00:00:00Z','proposed')
  ON CONFLICT(id) DO NOTHING;

  FOR rec IN
    SELECT s.code,s.title,ct.subject,ct.description,ctv.version old_version,ctv.curriculum
    FROM public.sections s
    JOIN public.course_template_versions ctv ON ctv.id=s.course_template_version_id
    JOIN public.course_templates ct ON ct.id=ctv.course_template_id
    WHERE s.site_id=valor_site
    ORDER BY s.code
  LOOP
    course_id:=md5('valor-v61:course:'||rec.code)::uuid;
    course_version_id:=md5('valor-v61:courseversion:'||rec.code)::uuid;

    INSERT INTO public.courses(id,publisher_organization_id,course_code,title,subject)
    VALUES(course_id,valor_org,rec.code,rec.title,rec.subject)
    ON CONFLICT(id) DO NOTHING;

    INSERT INTO public.course_versions(id,course_id,version_no,syllabus,lifecycle)
    VALUES(course_version_id,course_id,1,jsonb_build_object(
      'synthetic',true,'demonstration',true,'source','valor-2026-original-curriculum',
      'curriculumSourceVersion',rec.old_version,'description',coalesce(rec.description,''),
      'creditMode','noncredit_demo','instructionalReview','required',
      'publicationApproval','not_granted','originalTitle',rec.title),'draft')
    ON CONFLICT(id) DO NOTHING;

    INSERT INTO public.offering_courses(offering_version_id,course_version_id,is_required)
    VALUES(offering_version,course_version_id,true) ON CONFLICT DO NOTHING;

    IF jsonb_typeof(rec.curriculum#>'{learning,modules}')='array'
      AND jsonb_array_length(coalesce(rec.curriculum#>'{learning,modules}','[]'::jsonb))>0
    THEN modules:=rec.curriculum#>'{learning,modules}';
    ELSE modules:=jsonb_build_array(jsonb_build_object(
      'id','orientation','title','Getting Started','lessons',jsonb_build_array(
        jsonb_build_object('title','Orientation to '||rec.title,
          'body','This is a synthetic introductory lesson for '||rec.title||
            '. Explore an essential question, identify relevant evidence and outline next learning steps. Full content and teaching review are required before release.',
          'resources',jsonb_build_array()))));
    END IF;

    FOR u IN SELECT value AS module,ordinality::int AS n
      FROM jsonb_array_elements(modules) WITH ORDINALITY
    LOOP
      unit_id:=md5('valor-v61:unit:'||rec.code||':'||u.n)::uuid;
      INSERT INTO public.course_units
        (id,course_version_id,unit_key,title,sequence_no,content)
      VALUES(unit_id,course_version_id,'unit-'||u.n,
        coalesce(nullif(u.module->>'title',''),'Unit '||u.n),u.n,
        (u.module-'lessons')||'{"synthetic":true,"source":"valor-v61-rehydration"}'::jsonb)
      ON CONFLICT(id) DO NOTHING;
      lessons:=u.module->'lessons';
      IF jsonb_typeof(lessons)<>'array' OR coalesce(jsonb_array_length(lessons),0)=0
      THEN lessons:=jsonb_build_array(jsonb_build_object(
        'title','Introduction to '||rec.title,
        'body','Synthetic lesson awaiting independent instructional review and media.'));
      END IF;

      FOR l IN SELECT value AS lesson,ordinality::int AS n
        FROM jsonb_array_elements(lessons) WITH ORDINALITY
      LOOP
        INSERT INTO public.course_lessons
          (id,course_version_id,course_unit_id,lesson_key,title,lesson_order,content)
        VALUES(md5('valor-v61:lesson:'||rec.code||':'||u.n||':'||l.n)::uuid,
          course_version_id,unit_id,'u'||u.n||'-l'||l.n,
          coalesce(nullif(l.lesson->>'title',''),'Lesson '||l.n),l.n,
          l.lesson||'{"synthetic":true,"demoOnly":true,"source":"valor-v61-rehydration"}'::jsonb)
        ON CONFLICT(id) DO NOTHING;
      END LOOP;
    END LOOP;

    INSERT INTO public.classes(id,deployment_id,adoption_id,offering_version_id,
      course_version_id,operating_organization_id,site_id,title,capacity,
      delivery_mode,state,created_by_person_id)
    VALUES(md5('valor-v61:class:'||rec.code)::uuid,deployment_id,adoption_id,
      offering_version,course_version_id,valor_org,valor_site,rec.title,25,
      'hybrid','draft',operator_person)
    ON CONFLICT(id) DO NOTHING;
  END LOOP;
END $restore$;

-- These are pending synthetic placements, NOT active Course registrations.
INSERT INTO public.class_enrollments(id,class_id,learner_person_id,enrollment_method,
  credit_mode,status,enrolled_by_person_id,enrolled_at)
SELECT md5('valor-v61:classenrollment:'||e.id)::uuid,
  md5('valor-v61:class:'||s.code)::uuid,sp.person_id,'assignment','not_applicable',
  CASE WHEN e.status::text='withdrawn' THEN 'withdrawn' ELSE 'pending' END,
  'f7000000-0000-4000-8000-000000000001'::uuid,
  coalesce(e.started_at,e.created_at,now())
FROM public.enrollments e
JOIN public.sections s ON s.id=e.section_id
JOIN public.student_profiles sp ON sp.id=e.student_profile_id
JOIN public.classes c ON c.id=md5('valor-v61:class:'||s.code)::uuid AND c.site_id=s.site_id
WHERE s.site_id='f1000000-0000-4000-8000-000000000003'
  AND e.status::text IN ('active','withdrawn')
ON CONFLICT(id) DO NOTHING;

-- The Class Enrollment constraint requires immutable, exact-Site attribution.
INSERT INTO public.participation_attributions
  (id,class_enrollment_id,delivery_site_id,reporting_site_id,credited_organization_id,
   attribution_basis,relationship_snapshot)
SELECT md5('valor-v61:attribution:'||e.id)::uuid,ce.id,
  'f1000000-0000-4000-8000-000000000003'::uuid,
  'f1000000-0000-4000-8000-000000000003'::uuid,
  'f1000000-0000-4000-8000-000000000002'::uuid,
  'provider_default',
  '{"synthetic":true,"source":"valor-v61-rehydration","recordPurpose":"pending-demonstration"}'::jsonb
FROM public.enrollments e
JOIN public.sections s ON s.id=e.section_id
JOIN public.class_enrollments ce ON ce.id=md5('valor-v61:classenrollment:'||e.id)::uuid
WHERE s.site_id='f1000000-0000-4000-8000-000000000003'
  AND e.status::text IN ('active','withdrawn')
ON CONFLICT(id) DO NOTHING;

-- Four preexisting, review-required demo video candidates are REUSED to
-- cover the first lesson of each native Course. No new media ownership claim.
WITH first_lessons AS (
 SELECT l.id,row_number() OVER(ORDER BY c.course_code) course_n
 FROM public.course_lessons l
 JOIN public.course_versions cv ON cv.id=l.course_version_id
 JOIN public.courses c ON c.id=cv.course_id
 JOIN public.course_units u ON u.id=l.course_unit_id
 WHERE c.publisher_organization_id='f1000000-0000-4000-8000-000000000002'
   AND l.content->>'source'='valor-v61-rehydration'
   AND u.sequence_no=1 AND l.lesson_order=1
), candidates AS (
 SELECT row_number() OVER(ORDER BY id) n,content->'videoResources' resources
 FROM public.course_lessons
 WHERE id IN ('ca270000-0000-4000-8000-000000000044'::uuid,
              'ca270000-0000-4000-8000-000000000046'::uuid,
              'ca270000-0000-4000-8000-000000000047'::uuid,
              'ca270000-0000-4000-8000-000000000048'::uuid)
   AND jsonb_array_length(coalesce(content->'videoResources','[]'::jsonb))=1
), paired AS (
 SELECT f.id,c.resources FROM first_lessons f
 JOIN candidates c ON c.n=(f.course_n-1)%4+1
)
UPDATE public.course_lessons l
SET content=jsonb_set(jsonb_set(l.content,'{videoResources}',paired.resources,true),
  '{mediaStatus}','"linked_for_review"'::jsonb,true)
FROM paired WHERE l.id=paired.id
AND jsonb_array_length(coalesce(l.content->'videoResources','[]'::jsonb))=0;

COMMIT;

-- Next: psql -v ON_ERROR_STOP=1 -f scripts/acceptance/verify-valor-v61-rehydration.sql
