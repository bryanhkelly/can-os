-- CAN OS / Jordan Example demo section media. Idempotent. Reusable resources,
-- section-local overlays; DOES NOT modify published publisher curriculum JSON.
-- 40 CAN course-unit video introductions cover all associated lessons as supplemental
-- unit overviews, not individually educator-verified day-by-day instruction.
-- 3 English close-reading lessons receive directly relevant videos.
-- 4 legacy empty-shell sections get a class overview, not fabricated lessons.
-- All references remain third-party YouTube links and require educator review.
WITH curated(course_code,module_number,video_id,title) AS (
  VALUES
    ('CAN-ALG1',1,'YZBStgZGyDY','Khan Academy: Solving equations with the distributive property'),
    ('CAN-ALG1',2,'YBYu5aZPLeg','Khan Academy: Graphing linear inequalities'),
    ('CAN-ALG1',3,'IL3UCuXrUzE','Khan Academy: Slope-intercept form'),
    ('CAN-ALG1',4,'nok99JOhcjo','Khan Academy: Systems of equations'),
    ('CAN-ALG1',5,'Vm7H0VTlIco','Khan Academy: Introduction to polynomials'),
    ('CAN-ALG1',6,'K5ggNnKTmNM','Khan Academy: Factoring quadratics'),
    ('CAN-ALG1',7,'DrrYX7VhGLE','Khan Academy: Building quadratic functions'),
    ('CAN-ALG1',8,'6zZn4N994vw','Algebra 1: Scatter plots and lines of best fit'),
    ('CAN-ALG1',9,'BUmLw5m6F9s','Khan Academy: Modeling with systems of inequalities'),
    ('CAN-ALG1',10,'YZBStgZGyDY','Khan Academy: Solving equations with the distributive property'),
    ('CAN-BIO',1,'1Dx7LDwINLU','Amoeba Sisters: Biomolecules (Updated 2023)'),
    ('CAN-BIO',2,'8IlzKri08kk','Amoeba Sisters: Introduction to cells and organelles'),
    ('CAN-BIO',3,'7xeFP0SEDdc','Amoeba Sisters: Biology Review (cell transport 06:31)'),
    ('CAN-BIO',4,'CMiPYHNNg28','Amoeba Sisters: Photosynthesis (Updated)'),
    ('CAN-BIO',5,'7xeFP0SEDdc','Amoeba Sisters: Biology Review (DNA and protein synthesis)'),
    ('CAN-BIO',6,'7xeFP0SEDdc','Amoeba Sisters: Biology Review (genetics 17:57)'),
    ('CAN-BIO',7,'7xeFP0SEDdc','Amoeba Sisters: Biology Review (natural selection 22:00)'),
    ('CAN-BIO',8,'7xeFP0SEDdc','Amoeba Sisters: Biology Review (ecology 31:22)'),
    ('CAN-BIO',9,'7xeFP0SEDdc','Amoeba Sisters: Biology Review (ecological systems 34:40)'),
    ('CAN-BIO',10,'8IlzKri08kk','Amoeba Sisters: Introduction to cells and organelles'),
    ('CAN-ENG9',1,'I4kz-C7GryY','Crash Course: Romeo and Juliet Part 1'),
    ('CAN-ENG9',2,'INFWXZ_tl4M','Khan Academy: Making inferences in literary texts'),
    ('CAN-ENG9',3,'INFWXZ_tl4M','Khan Academy: Making inferences in literary texts'),
    ('CAN-ENG9',4,'MAu3e5GZo4k','Khan Academy: Understanding theme'),
    ('CAN-ENG9',5,'lzKj-bLvrYQ','Khan Academy: Figurative language'),
    ('CAN-ENG9',6,'xqKeBdVyJgU','Khan Academy: Using examples as evidence'),
    ('CAN-ENG9',7,'9J4hoAatGRQ','Crash Course: Romeo and Juliet Part 2'),
    ('CAN-ENG9',8,'KlgR1q3UQZE','Crash Course Study Skills: Papers and Essays'),
    ('CAN-ENG9',9,'KlgR1q3UQZE','Crash Course Study Skills: Papers and Essays'),
    ('CAN-ENG9',10,'xqKeBdVyJgU','Khan Academy: Using examples as evidence'),
    ('CAN-USHIST',1,'o69TvQqyGdg','Crash Course US History: Colonizing America #2'),
    ('CAN-USHIST',2,'3EiSymRrKI4','Crash Course US History: American Revolution #7'),
    ('CAN-USHIST',3,'bO7FQsCcbD8','Crash Course US History: Constitution and Federalism #8'),
    ('CAN-USHIST',4,'_3Ox6vGteek','Crash Course US History: Thomas Jefferson #10'),
    ('CAN-USHIST',5,'Ajn9g5Gsv98','Crash Course US History: Slavery #13'),
    ('CAN-USHIST',6,'nowsS7pMApI','Crash Course US History: Reconstruction #22'),
    ('CAN-USHIST',7,'Objoad6rG6U','Crash Course US History: World War II #35'),
    ('CAN-USHIST',8,'S64zRnnn4Po','Crash Course US History: Civil Rights #39'),
    ('CAN-USHIST',9,'-rboN6F2g-k','Crash Course US History: The Clinton Years #45'),
    ('CAN-USHIST',10,'bO7FQsCcbD8','Crash Course US History: Constitution and Federalism #8'),
    ('ENG-CR-01',1,'INFWXZ_tl4M','Khan Academy: Making inferences in literary texts'),
    ('ENG-CR-01',2,'xqKeBdVyJgU','Khan Academy: Using examples as evidence'),
    ('ENG-CR-01',3,'MAu3e5GZo4k','Khan Academy: Understanding theme and interpretations'),
    ('ALG-S',0,'E1j8W64NQ0Y','Khan Academy: Algebra II rational equations'),
    ('BIO-S',0,'8IlzKri08kk','Amoeba Sisters: Introduction to cells'),
    ('HIS-S',0,'3k0v5ZvZrVQ','Crash Course: World History Office Hours'),
    ('HR-S',0,'E7CwqNHn_Ns','Crash Course Study Skills: Taking Notes')
),
jordan_sections AS (
  SELECT DISTINCT sec.id section_id,sec.code course_code,sec.program_id,sec.site_id,
    program.organization_id,sec.course_template_version_id version_id,version.curriculum
  FROM public.enrollments enrollment
  JOIN public.sections sec ON sec.id=enrollment.section_id AND sec.active=true
  JOIN public.programs program ON program.id=sec.program_id
  JOIN public.course_template_versions version ON version.id=sec.course_template_version_id
  WHERE enrollment.student_profile_id='f1000000-0000-4000-8000-000000000007'::uuid
    AND enrollment.status='active' AND enrollment.kind='section'
    AND version.status::text='published'
),
assignments AS (
  SELECT scope.*,map.module_number,map.video_id,map.title,lesson->>'id' lesson_id
  FROM jordan_sections scope
  JOIN curated map ON map.course_code=scope.course_code AND map.module_number>0
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(scope.curriculum->'learning'->'modules','[]'::jsonb)) WITH ORDINALITY module(content,number)
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(module.content->'lessons','[]'::jsonb)) lesson
  WHERE module.number=map.module_number
  UNION ALL
  SELECT scope.*,map.module_number,map.video_id,map.title,NULL::text lesson_id
  FROM jordan_sections scope JOIN curated map
    ON map.course_code=scope.course_code AND map.module_number=0
),
selected_resources AS (
  SELECT DISTINCT md5('can-jordan-youtube-resource-20261119:'||video_id)::uuid AS resource_id,
    organization_id,video_id,title
  FROM assignments
),
insert_resources AS (
  INSERT INTO public.curriculum_resources (
    id,owner_organization_id,kind,title,url,license_code,attribution,
    source_url,source_format,source_identifier,metadata
  )
  SELECT resource_id,organization_id,'video',title,
    'https://www.youtube.com/watch?v='||video_id,
    'EXTERNAL-LINK-ONLY','Original creator on YouTube; linked, not copied',
    'https://www.youtube.com/watch?v='||video_id,'youtube',video_id,
    jsonb_build_object('source','youtube_lesson_matching_20261119',
      'reviewStatus','teacher_review_required',
      'matchLevel','unit_or_class_overview',
      'rightsNote','External link only; do not imply rights to copy')
  FROM selected_resources
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
available_resources AS (
  SELECT id FROM insert_resources
  UNION
  SELECT resource.id FROM public.curriculum_resources resource
  JOIN selected_resources selected ON selected.resource_id=resource.id
),
insert_overlays AS (
  INSERT INTO public.curriculum_overlays (
    id,organization_id,program_id,site_id,section_id,
    course_template_version_id,lesson_id,title,kind,resource_id,status,
    created_by_person_id,metadata
  )
  SELECT md5('can-jordan-lesson-video-20261119:'||assignment.section_id::text||
    ':'||coalesce(assignment.lesson_id,'CLASS')||':'||assignment.video_id)::uuid,
    assignment.organization_id,assignment.program_id,assignment.site_id,
    assignment.section_id,assignment.version_id,assignment.lesson_id,
    'Supplemental video · '||assignment.title,'video',
    resource.id,'active',
    'f1000000-0000-4000-8000-000000000006'::uuid,
    jsonb_build_object('scope','section','source','system_curated',
      'curationBatch','jordan-youtube-20261119',
      'reviewStatus','teacher_review_required',
      'matchGranularity',case when assignment.module_number=0 then 'class_overview'
        when assignment.course_code='ENG-CR-01' then 'lesson_topic'
        else 'unit_overview' end,
      'videoId',assignment.video_id,'notCompletionEvidence',true)
  FROM assignments assignment
  JOIN available_resources resource ON resource.id=
    md5('can-jordan-youtube-resource-20261119:'||assignment.video_id)::uuid
  ON CONFLICT (id) DO NOTHING
  RETURNING id,section_id,lesson_id
)
SELECT (SELECT count(*) FROM insert_resources) inserted_resources,
       (SELECT count(*) FROM insert_overlays) inserted_overlays,
       (SELECT count(*) FROM assignments) expected_bindings,
       (SELECT count(DISTINCT section_id) FROM insert_overlays) sections_affected;
