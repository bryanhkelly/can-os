-- Valor V6.1 synthetic preview for teacher feedback and knowledge checks.
-- No official grades, published tests, assessment grants, or grader credentials
-- are manufactured. Existing demo submission previews remain noncredit.
DO $fixture$
DECLARE
 vsite constant uuid:='f1000000-0000-4000-8000-000000000003';
 vorg constant uuid:='f1000000-0000-4000-8000-000000000002';
 vdep constant uuid:=md5('valor-v61:deployment')::uuid;
 vop constant uuid:=md5('valor-v61:operation')::uuid;
 jr constant uuid:='f1000000-0000-4000-8000-000000000005';
 riley constant uuid:='f1000000-0000-4000-8000-000000000006';
 rec record;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=vsite AND organization_id=vorg
 AND metadata @> '{"synthetic":true}'::jsonb)
 OR NOT EXISTS (SELECT 1 FROM public.people WHERE id=riley AND metadata @> '{"synthetic":true}'::jsonb)
 OR NOT EXISTS (SELECT 1 FROM public.class_staff_assignments sa JOIN public.classes c ON c.id=sa.class_id
 WHERE c.site_id=vsite AND sa.person_id=riley AND sa.role_code='teacher' AND sa.state='approved'
 AND c.course_version_id=md5('valor-v61:courseversion:CAN-ALG1')::uuid)
 THEN RAISE EXCEPTION 'Valor synthetic current teacher guard failed'; END IF;
 -- A proposed appointment is not a professional authorization. The database
 -- enforces verified capability evidence before any status=approved transition.
 INSERT INTO public.grading_assignments
 (id,grader_person_id,appointing_organization_id,course_version_id,
  operation_id,deployment_id,section_id,starts_at,status,capability_authorization_id,capability_id)
 VALUES
 (md5('valor-v61:review:proposed-riley-algebra1')::uuid,riley,vorg,
   md5('valor-v61:courseversion:CAN-ALG1')::uuid,vop,vdep,NULL,
   '2026-11-20T10:00:00Z','proposed',NULL,NULL)
 ON CONFLICT(id) DO NOTHING;
 -- Draft assessment administration for each subject; opening requires
 -- independently reviewed and PUBLISHED Assessment and Form versions.
 FOR rec IN
 SELECT av.id assessment_id,av.course_version_id,av.assessment_key,
        fv.id form_version_id,c.course_code
 FROM public.assessment_versions av
 JOIN public.assessment_form_versions fv ON fv.assessment_version_id=av.id
 JOIN public.course_versions cv ON cv.id=av.course_version_id
 JOIN public.courses c ON c.id=cv.course_id
 JOIN public.classes cls ON cls.course_version_id=cv.id
 WHERE cls.site_id=vsite AND av.assessment_key LIKE 'valor.demo.%'
  AND av.lifecycle='draft' AND fv.lifecycle='draft'
 LOOP
  INSERT INTO public.assessment_administrations
  (id,administering_organization_id,assessment_version_id,form_version_id,
   operation_id,deployment_id,course_version_id,administration_code,
   status,opens_at,closes_at,attempt_limit,proctor_policy,policy_snapshot)
  VALUES(md5('valor-v61:assessment-admin:draft:'||rec.course_code)::uuid,
    vorg,rec.assessment_id,rec.form_version_id,vop,vdep,rec.course_version_id,
    'valor.demo.'||lower(rec.course_code)||'.draft.preflight','draft',
    '2026-12-07T17:00:00Z','2026-12-21T17:00:00Z',
    1,'none','{"synthetic":true,"fixture":"valor-v61-extended-scenarios","testOnly":true,"publicationNotApproved":true,"noLearnerAccess":true}'::jsonb)
  ON CONFLICT(id) DO NOTHING;
 END LOOP;
 IF (SELECT count(*) FROM public.grading_assignments WHERE id=
  md5('valor-v61:review:proposed-riley-algebra1')::uuid AND status='proposed'
  AND capability_authorization_id IS NULL)<>1
 OR (SELECT count(*) FROM public.assessment_administrations aa
   WHERE aa.administration_code LIKE 'valor.demo.%.draft.preflight'
    AND aa.deployment_id=vdep AND aa.status='draft')<>12
 THEN RAISE EXCEPTION 'Synthetic review and assessment draft state not complete'; END IF;
END $fixture$;
