-- Valor synthetic curriculum recovery. Draft only; no enrollment, credit,
-- published content, or existing version changes. Re-runnable on Neon main.
DO $valor_curriculum$
DECLARE
  org CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
  site CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
  rec record;
  source record;
  unit record;
  lesson record;
  draft_id uuid;
  unit_id uuid;
  target_id uuid;
  next_version integer;
  source_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=site AND organization_id=org
      AND metadata @> '{"synthetic":true}'::jsonb) THEN
    RAISE EXCEPTION 'Synthetic Valor scope not verified';
  END IF;
  FOR rec IN SELECT * FROM (VALUES
    ('ALG-S','CAN-ALG2','784b017a-ec81-8296-38fe-68cc99661b5c'::uuid),
    ('HIS-S','CAN-WORLD','658ef05d-695c-6344-d802-72c2a2df44a9'::uuid)
  ) AS mapping(target_code,source_code,source_id)
  LOOP
    SELECT ct.title,ctv.curriculum INTO STRICT source
    FROM public.course_template_versions ctv
    JOIN public.course_templates ct ON ct.id=ctv.course_template_id
    WHERE ctv.id=rec.source_id AND ct.code=rec.source_code
      AND ct.owning_organization_id=org AND ctv.status='draft'
      AND ctv.curriculum->'source'->>'synthetic'='true';
    SELECT c.id INTO STRICT target_id FROM public.courses c
    WHERE c.course_code=rec.target_code AND c.publisher_organization_id=org
      AND EXISTS (SELECT 1 FROM public.classes cls JOIN public.course_versions cv
        ON cv.id=cls.course_version_id WHERE cv.course_id=c.id AND cls.site_id=site
        AND cls.operating_organization_id=org AND cv.lifecycle='published'
        AND cv.syllabus @> '{"synthetic":true}'::jsonb);
    PERFORM 1 FROM public.courses WHERE id=target_id FOR UPDATE;
    SELECT count(*) INTO source_count
    FROM jsonb_array_elements(source.curriculum->'learning'->'modules') m
    CROSS JOIN LATERAL jsonb_array_elements(m->'lessons') l
    WHERE nullif(trim(l->>'body'),'') IS NOT NULL
      AND nullif(trim(l->>'title'),'') IS NOT NULL;
    IF source_count<>180 THEN RAISE EXCEPTION 'Unexpected source coverage: %',rec.source_code; END IF;
    SELECT id INTO draft_id FROM public.course_versions
      WHERE course_id=target_id AND syllabus->>'importedTemplateVersionId'=rec.source_id::text;
    IF draft_id IS NULL THEN
      SELECT coalesce(max(version_no),0)+1 INTO next_version FROM public.course_versions WHERE course_id=target_id;
      INSERT INTO public.course_versions(id,course_id,version_no,syllabus,lifecycle)
      VALUES(gen_random_uuid(),target_id,next_version,jsonb_build_object(
        'synthetic',true,'source','valor-yearlong-draft-recovery',
        'importedTemplateVersionId',rec.source_id,'sourceTemplateCode',rec.source_code,
        'sourceMetadata',source.curriculum->'source','creditStatus','not_credit_ready',
        'instructionalReview','required','publicationApproval','not_granted',
        'requiresIndependentCurriculumReview',true,'lessonCount',180),'draft')
      RETURNING id INTO draft_id;
      FOR unit IN SELECT value AS content, ordinality AS seq
          FROM jsonb_array_elements(source.curriculum->'learning'->'modules') WITH ORDINALITY
      LOOP
        INSERT INTO public.course_units(id,course_version_id,unit_key,title,sequence_no,content)
        VALUES(gen_random_uuid(),draft_id,unit.content->>'id',unit.content->>'title',unit.seq::integer,
          (unit.content - 'lessons') || '{"synthetic":true,"draftOnly":true}'::jsonb)
        RETURNING id INTO unit_id;
        FOR lesson IN SELECT value AS content, ordinality AS seq
            FROM jsonb_array_elements(unit.content->'lessons') WITH ORDINALITY
        LOOP
          INSERT INTO public.course_lessons(id,course_version_id,course_unit_id,lesson_key,title,lesson_order,content)
          VALUES(gen_random_uuid(),draft_id,unit_id,lesson.content->>'id',lesson.content->>'title',
            lesson.seq::integer,lesson.content || '{"synthetic":true,"draftOnly":true,"requiresIndependentReview":true}'::jsonb);
        END LOOP;
      END LOOP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.course_versions WHERE id=draft_id AND lifecycle='draft')
      OR (SELECT count(*) FROM public.course_units WHERE course_version_id=draft_id)<>9
      OR (SELECT count(*) FROM public.course_lessons WHERE course_version_id=draft_id)<>180
    THEN RAISE EXCEPTION 'Draft reconciliation failed: %',rec.target_code; END IF;
  END LOOP;
END $valor_curriculum$;