-- Preserve retired draft content and identifiers, but mark the single native
-- successor as the current working draft. Never rewrite a published version.
DO $supersede$
DECLARE
  org CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
  site CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
  rec record;
  old_id uuid;
  new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=site AND organization_id=org AND metadata @> '{"synthetic":true}'::jsonb) THEN RAISE EXCEPTION 'Valor scope not verified'; END IF;
  FOR rec IN SELECT * FROM (VALUES
    ('ALG-S','valor-yearlong-draft-recovery',180,'784b017a-ec81-8296-38fe-68cc99661b5c'::uuid),
    ('HIS-S','valor-yearlong-draft-recovery',180,'658ef05d-695c-6344-d802-72c2a2df44a9'::uuid),
    ('HR-S','valor-homeroom-weekly-draft-20261124',12,NULL::uuid)
  ) AS x(code,source,lesson_count,legacy_id)
  LOOP
    SELECT cv.id INTO STRICT old_id FROM public.course_versions cv JOIN public.courses c ON c.id=cv.course_id
      WHERE c.publisher_organization_id=org AND c.course_code=rec.code AND cv.version_no=2 AND cv.lifecycle='draft' AND cv.syllabus @> '{"synthetic":true}'::jsonb;
    SELECT cv.id INTO STRICT new_id FROM public.course_versions cv JOIN public.courses c ON c.id=cv.course_id
      WHERE c.publisher_organization_id=org AND c.course_code=rec.code AND cv.lifecycle='draft' AND cv.syllabus->>'source'=rec.source
      AND cv.syllabus @> '{"synthetic":true}'::jsonb AND cv.syllabus->>'supersededByCourseVersionId' IS NULL;
    IF (SELECT count(*) FROM public.course_lessons WHERE course_version_id=new_id)<>rec.lesson_count
      OR EXISTS(SELECT 1 FROM public.classes WHERE course_version_id=old_id)
      OR EXISTS(SELECT 1 FROM public.learner_course_attempts WHERE course_version_id=old_id)
      OR EXISTS(SELECT 1 FROM public.offering_courses WHERE course_version_id=old_id)
      OR EXISTS(SELECT 1 FROM public.instructional_track_versions WHERE course_version_id=old_id)
      OR EXISTS(SELECT 1 FROM public.graded_assignments WHERE course_version_id=old_id)
    THEN RAISE EXCEPTION 'Draft is in use or successor coverage changed: %',rec.code; END IF;
    UPDATE public.course_versions SET syllabus=syllabus||jsonb_build_object('supersededByCourseVersionId',new_id,'supersessionReason','native-curriculum-consolidation-20261124')
      WHERE id=old_id AND syllabus->>'supersededByCourseVersionId' IS NULL;
    IF NOT EXISTS(SELECT 1 FROM public.course_versions WHERE id=old_id AND syllabus->>'supersededByCourseVersionId'=new_id::text)
      THEN RAISE EXCEPTION 'Unexpected native supersession'; END IF;
    IF rec.legacy_id IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM public.course_template_versions tv JOIN public.course_templates t ON t.id=tv.course_template_id
        WHERE tv.id=rec.legacy_id AND t.owning_organization_id=org AND tv.status='draft'
        AND tv.curriculum->'source'->>'synthetic'='true')
        OR EXISTS(SELECT 1 FROM public.sections WHERE course_template_version_id=rec.legacy_id)
        OR NOT EXISTS(SELECT 1 FROM public.course_versions WHERE id=new_id AND syllabus->>'importedTemplateVersionId'=rec.legacy_id::text)
      THEN RAISE EXCEPTION 'Legacy source not verified: %',rec.code; END IF;
      UPDATE public.course_template_versions SET curriculum=curriculum||jsonb_build_object('supersededByCourseVersionId',new_id,'supersessionReason','native-curriculum-consolidation-20261124'),updated_at=now()
        WHERE id=rec.legacy_id AND curriculum->>'supersededByCourseVersionId' IS NULL;
      IF NOT EXISTS(SELECT 1 FROM public.course_template_versions WHERE id=rec.legacy_id AND curriculum->>'supersededByCourseVersionId'=new_id::text)
        THEN RAISE EXCEPTION 'Unexpected legacy supersession'; END IF;
    END IF;
  END LOOP;
END $supersede$;