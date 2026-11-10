-- Valor School synthetic-only CAN Standard student-facing release.
-- User-directed demo operation, 2026-11-10. This is not credit or academic approval.
-- Explicitly preserves old immutable releases, course grades, submissions and lesson progress.
DO $valor_release$
DECLARE
  org_id CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
  program_id CONSTANT uuid := 'f1000000-0000-4000-8000-000000000004';
  site_id CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
  pack_id CONSTANT uuid := 'f9260000-0000-4000-8000-000000000001';
  old_pack_version CONSTANT uuid := '1cba8559-6bb3-b3f8-f574-26ba3ab2d82e';
  new_pack_version CONSTANT uuid := md5('valor-student-facing-can-core-2026-11-10-pack-v3')::uuid;
  release_note CONSTANT text := 'User-directed release of four enhanced CAN Standard synthetic Valor preview courses for student lesson access; not approved for credit.';
  target record;
  archived jsonb;
  next_curriculum jsonb;
  orig_items integer;
  pack_items integer;
  moved integer := 0;
  old_progress integer;
  copied_progress integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('valor-student-facing-can-core-2026-11-10'));
  IF NOT EXISTS (
    SELECT 1 FROM organizations o JOIN programs p ON p.organization_id=o.id
      JOIN sites si ON si.id=p.site_id
    WHERE o.id=org_id AND o.metadata->>'synthetic'='true'
      AND p.id=program_id AND p.metadata->>'synthetic'='true'
      AND si.id=site_id AND si.metadata->>'synthetic'='true'
  ) THEN RAISE EXCEPTION 'Release is authorized ONLY for the existing Valor synthetic school, site and program'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM curriculum_packs cp JOIN curriculum_pack_versions v ON v.pack_id=cp.id
    JOIN curriculum_adoptions a ON a.pack_version_id=v.id AND a.pack_id=cp.id
    JOIN curriculum_entitlements e ON e.pack_id=cp.id AND e.organization_id=a.organization_id
    WHERE cp.id=pack_id AND cp.publisher_organization_id=org_id
      AND cp.license_code='DEMO-INTERNAL' AND cp.metadata->>'synthetic'='true'
      AND v.id=old_pack_version AND v.version=2 AND v.status='published'
      AND a.program_id=program_id AND a.status='active'
      AND e.status='active'
  ) THEN
    IF EXISTS(SELECT 1 FROM curriculum_pack_versions WHERE id=new_pack_version AND version=3 AND status='published') THEN
      RAISE NOTICE 'Synthetic pack v3 already published. Verifying existing state without reapplying.';
    ELSE
      RAISE EXCEPTION 'Valor v2 synthetic pack, entitlement and pinned adoption must already exist';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM curriculum_pack_versions WHERE id=new_pack_version) THEN
    IF (SELECT COUNT(*) FROM sections s JOIN course_template_versions v ON v.id=s.course_template_version_id
        JOIN course_templates c ON c.id=v.course_template_id
        WHERE s.program_id=program_id AND s.code IN ('CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST')
          AND s.active AND v.status='published' AND v.curriculum#>>'{source,studentRelease}'='synthetic_valor_preview_2026-11')=4
       AND EXISTS(SELECT 1 FROM curriculum_adoptions WHERE program_id=program_id AND pack_id=pack_id AND pack_version_id=new_pack_version AND status='active')
    THEN
      RAISE NOTICE 'Release already complete: four enhanced published courses, four student-facing sections, and v3 adoption.';
      RETURN;
    ELSE
      RAISE EXCEPTION 'Partial existing pack v3 detected; reconcile before attempting release';
    END IF;
  END IF;

  SELECT COUNT(*) INTO orig_items FROM curriculum_pack_items WHERE pack_version_id=old_pack_version;
  IF orig_items<>32 THEN RAISE EXCEPTION 'Expected 32 items in original v2 pack, found %',orig_items; END IF;
  IF (SELECT COUNT(*) FROM sections WHERE program_id=program_id AND code IN ('CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST') AND active AND metadata->>'synthetic'='true')<>4
    THEN RAISE EXCEPTION 'Expected exactly four active synthetic CAN core sections'; END IF;
  IF (SELECT COUNT(*) FROM course_template_versions v JOIN course_templates c ON c.id=v.course_template_id
       WHERE c.owning_organization_id=org_id AND c.code IN('CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST')
       AND v.status='draft' AND v.curriculum#>>'{source,quality}'='unreviewed_yearlong_instructional_scaffold')<>4
    THEN RAISE EXCEPTION 'Four original working draft releases are required'; END IF;

  FOR target IN
    SELECT s.id AS section_id,s.code,s.course_template_version_id AS old_version_id,
      old.curriculum AS old_content, old.status AS old_status,
      c.id AS course_id,n.id AS new_version_id,n.version AS new_version,
      n.curriculum AS new_content
    FROM sections s
    JOIN course_template_versions old ON old.id=s.course_template_version_id
    JOIN course_templates c ON c.id=old.course_template_id
    JOIN course_template_versions n ON n.course_template_id=c.id AND n.status='draft'
      AND n.curriculum#>>'{source,quality}'='unreviewed_yearlong_instructional_scaffold'
    WHERE s.program_id=program_id AND s.active AND s.metadata->>'synthetic'='true'
      AND c.owning_organization_id=org_id AND s.code=c.code
      AND s.code IN('CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST')
    ORDER BY s.code
  LOOP
    IF target.old_status<>'published' OR target.new_content#>>'{source,synthetic}'<>'true'
       OR target.new_content#>>'{learning,blueprint,creditStatus}'<>'not_credit_ready'
       OR target.new_content#>>'{learning,blueprint,reviewStatus}'<>'planning'
       OR jsonb_array_length(target.new_content#>'{learning,blueprint,weeks}')<>36
       OR jsonb_array_length(target.new_content#>'{learning,modules}')<>9
       OR (SELECT COUNT(*) FROM jsonb_array_elements(target.new_content#>'{learning,modules}') m
             CROSS JOIN LATERAL jsonb_array_elements(m->'lessons') l)<>180
       OR (SELECT COUNT(*) FROM jsonb_array_elements(target.new_content#>'{teacherGuides,units}') g
             CROSS JOIN LATERAL jsonb_array_elements(g->'lessons') l)<>40
    THEN RAISE EXCEPTION 'Unsafe or incomplete synthetic draft: %',target.code; END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(target.old_content#>'{learning,modules}') archive
       JOIN LATERAL jsonb_array_elements(archive->'lessons') old_l ON true
       JOIN LATERAL jsonb_array_elements(target.new_content#>'{learning,modules}') new_m ON true
       JOIN LATERAL jsonb_array_elements(new_m->'lessons') new_l ON old_l->>'id'=new_l->>'id'
       WHERE archive->>'id'='foundations'
    ) THEN RAISE EXCEPTION 'Duplicate archived Foundation lesson ID in %',target.code; END IF;

    -- Retain the four old foundation lessons under their original stable IDs.
    -- Algebra I's five previously-published deeper lessons already exist in its new Unit 1
    -- with the same IDs, so they are not copied twice.
    SELECT jsonb_agg(jsonb_set(archive,'{title}',
         to_jsonb('Prior learning · '||archive->>'title'),false))
      INTO archived
    FROM jsonb_array_elements(target.old_content#>'{learning,modules}') archive
    WHERE archive->>'id'='foundations';
    IF archived IS NULL OR jsonb_array_length(archived)<>1
      OR jsonb_array_length(archived->0->'lessons')<>4
    THEN RAISE EXCEPTION 'Missing immutable prior Foundations lessons for %',target.code; END IF;

    next_curriculum := jsonb_set(
       jsonb_set(
         jsonb_set(
           target.new_content,
           '{learning,modules}',(target.new_content#>'{learning,modules}')||archived,false),
         '{source,studentRelease}',to_jsonb('synthetic_valor_preview_2026-11'::text),true),
       '{source,releaseContext}',jsonb_build_object(
         'scope','internal_synthetic_demo_only','credits','not_approved',
         'academicReview','pending','previousVersionId',target.old_version_id,
         'releaseReason',release_note,
         'retainedPreviousFoundations',true),true);

    UPDATE course_template_versions SET status='published',
      curriculum=next_curriculum,published_at=now(),updated_at=now()
    WHERE id=target.new_version_id AND status='draft';
    IF NOT FOUND THEN RAISE EXCEPTION 'Draft publication race for %',target.code; END IF;

    INSERT INTO audit_events(actor_person_id,action,resource_type,resource_id,scope,before,after,context)
    VALUES (NULL,'curriculum.publish','course_template_version',target.new_version_id,
      jsonb_build_object('organizationId',org_id,'siteId',site_id,'programId',program_id),
      jsonb_build_object('status','draft'),
      jsonb_build_object('status','published','reason',release_note,'source','synthetic_user_directed_demo',
        'newVersion',target.new_version,'previousVersionId',target.old_version_id,
        'studentPreview',true,'creditApproved',false),
      jsonb_build_object('actor','user_directed_operator_release','synthetic',true));

    INSERT INTO domain_events(event_type,aggregate_type,aggregate_id,actor_person_id,payload)
    VALUES ('CurriculumPublished','course_template_version',target.new_version_id,NULL,
      jsonb_build_object('courseId',target.course_id,'version',target.new_version,
        'programId',program_id,'organizationId',org_id,'previousSectionsUnchangedAtPublication',true,
        'syntheticDemo',true,'notForCredit',true));
    moved:=moved+1;
  END LOOP;
  IF moved<>4 THEN RAISE EXCEPTION 'Expected to publish exactly 4 Valor new course versions, got %',moved; END IF;

  INSERT INTO curriculum_pack_versions(id,pack_id,version,status,published_at,metadata)
  VALUES(new_pack_version,pack_id,3,'published',now(),
    jsonb_build_object('synthetic',true,'preview',true,'notForCredit',true,
      'contentStatus','student_visible_unreviewed_demo',
      'previousPackVersionId',old_pack_version,
      'releaseReason',release_note,'requestedBy','user',
      'courseUpdates',jsonb_build_array('CAN-ALG1','CAN-ENG9','CAN-BIO','CAN-USHIST')));

  INSERT INTO curriculum_pack_items (id,pack_version_id,course_template_version_id,position,metadata)
  SELECT md5('valor-core-preview-v3-item:'||c.id::text)::uuid,new_pack_version,
     COALESCE(new_release.id,old_item.course_template_version_id),
     old_item.position,
     old_item.metadata || jsonb_build_object('fromPackVersion',old_pack_version,
       'upgradedForStudentPreview',(new_release.id IS NOT NULL))
  FROM curriculum_pack_items old_item
  JOIN course_template_versions prior ON prior.id=old_item.course_template_version_id
  JOIN course_templates c ON c.id=prior.course_template_id
  LEFT JOIN course_template_versions new_release ON
     new_release.course_template_id=c.id
     AND new_release.status='published'
     AND new_release.curriculum#>>'{source,studentRelease}'='synthetic_valor_preview_2026-11'
  WHERE old_item.pack_version_id=old_pack_version;

  SELECT COUNT(*) INTO pack_items FROM curriculum_pack_items WHERE pack_version_id=new_pack_version;
  IF pack_items<>32 OR
     (SELECT COUNT(DISTINCT v.course_template_id) FROM curriculum_pack_items i
       JOIN course_template_versions v ON v.id=i.course_template_version_id
       WHERE i.pack_version_id=new_pack_version)<>32
     OR EXISTS (SELECT 1 FROM curriculum_pack_items i JOIN course_template_versions v
           ON v.id=i.course_template_version_id WHERE i.pack_version_id=new_pack_version AND v.status<>'published')
  THEN RAISE EXCEPTION 'v3 pack must contain exactly 32 unique PUBLISHED course versions'; END IF;

  INSERT INTO audit_events(actor_person_id,action,resource_type,resource_id,scope,before,after,context)
  VALUES(NULL,'curriculum.pack.publish','curriculum_pack_version',new_pack_version,
    jsonb_build_object('organizationId',org_id,'siteId',site_id,'programId',program_id),
    jsonb_build_object('previousPackVersionId',old_pack_version),
    jsonb_build_object('status','published','version',3,'itemCount',32,'updatedCourses',4,
      'reason',release_note,'notForCredit',true),
    jsonb_build_object('actor','user_directed_operator_release','synthetic',true));
  INSERT INTO domain_events(event_type,aggregate_type,aggregate_id,actor_person_id,payload)
  VALUES('CurriculumPublisherPackPublished','curriculum_pack_version',new_pack_version,NULL,
    jsonb_build_object('packId',pack_id,'programId',program_id,'organizationId',org_id,
       'syntheticDemo',true,'notForCredit',true,'updatedCourseCount',4));

  -- Explicit, audited one-time revision of the pre-existing SYNTHETIC adoption.
  -- The legacy UI disallows silent adoption changes; this is user-directed and scoped.
  UPDATE curriculum_adoptions
  SET pack_version_id=new_pack_version,
      metadata=metadata||jsonb_build_object('explicitSyntheticUpgrade',true,
         'previousPackVersionId',old_pack_version,'releaseReason',release_note,
         'studentPreviewReleasedAt',now(),'notForCredit',true),
      updated_at=now()
  WHERE program_id=program_id AND organization_id=org_id AND pack_id=pack_id
    AND pack_version_id=old_pack_version AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Expected existing pinned synthetic adoption for v2'; END IF;
  INSERT INTO audit_events(actor_person_id,action,resource_type,resource_id,scope,before,after,context)
  SELECT NULL,'curriculum.marketplace.adoption.revise','curriculum_adoption',a.id,
     jsonb_build_object('organizationId',org_id,'siteId',site_id,'programId',program_id),
     jsonb_build_object('packVersionId',old_pack_version),
     jsonb_build_object('packVersionId',new_pack_version,'reason',release_note,'synthetic',true),
     jsonb_build_object('actor','user_directed_operator_release')
  FROM curriculum_adoptions a WHERE a.program_id=program_id AND a.pack_id=pack_id
    AND a.pack_version_id=new_pack_version;
  INSERT INTO domain_events(event_type,aggregate_type,aggregate_id,actor_person_id,payload)
  SELECT 'CurriculumPackAdopted','curriculum_adoption',a.id,NULL,
     jsonb_build_object('programId',program_id,'organizationId',org_id,'packId',pack_id,
        'versionId',new_pack_version,'revisedFrom',old_pack_version,'syntheticDemo',true)
  FROM curriculum_adoptions a WHERE a.program_id=program_id AND a.pack_id=pack_id
    AND a.pack_version_id=new_pack_version;

  FOR target IN
    SELECT s.id AS section_id,s.code,s.course_template_version_id AS old_version_id,
      n.id AS new_version_id
    FROM sections s
    JOIN course_template_versions old ON old.id=s.course_template_version_id
    JOIN course_templates c ON c.id=old.course_template_id
    JOIN course_template_versions n ON n.course_template_id=c.id AND n.status='published'
       AND n.curriculum#>>'{source,studentRelease}'='synthetic_valor_preview_2026-11'
    WHERE s.program_id=program_id AND s.active AND s.metadata->>'synthetic'='true'
      AND c.owning_organization_id=org_id AND s.code=c.code
      AND s.code IN('CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST')
    ORDER BY s.code
  LOOP
    SELECT COUNT(*) INTO old_progress FROM lesson_progress WHERE section_id=target.section_id;

    -- Copy prior progress to the new version only when the original lesson ID
    -- exists in the new snapshot. Every earlier source progress row is retained.
    INSERT INTO lesson_progress(section_id,student_profile_id,course_template_version_id,
      lesson_id,completed_at,created_at,updated_at)
    SELECT lp.section_id,lp.student_profile_id,target.new_version_id,lp.lesson_id,
       MAX(lp.completed_at),MIN(lp.created_at),now()
    FROM lesson_progress lp
    WHERE lp.section_id=target.section_id
      AND EXISTS (
        SELECT 1 FROM course_template_versions current_version,
          LATERAL jsonb_array_elements(current_version.curriculum#>'{learning,modules}') m,
          LATERAL jsonb_array_elements(m->'lessons') lesson
        WHERE current_version.id=target.new_version_id
          AND lesson->>'id'=lp.lesson_id
      )
    GROUP BY lp.section_id,lp.student_profile_id,lp.lesson_id
    ON CONFLICT(student_profile_id,section_id,course_template_version_id,lesson_id)
      DO NOTHING;

    UPDATE sections SET course_template_version_id=target.new_version_id,
      metadata=metadata || jsonb_build_object(
        'courseVersionUpgrade','synthetic-valor-2026-11-student-release',
        'previousCourseTemplateVersionId',target.old_version_id,
        'releasePackVersionId',new_pack_version,
        'studentPreview',true,'notForCredit',true),
      updated_at=now()
    WHERE id=target.section_id AND course_template_version_id=target.old_version_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pinned classroom version changed during release for %',target.code; END IF;

    INSERT INTO audit_events(actor_person_id,action,resource_type,resource_id,scope,before,after,context)
    VALUES(NULL,'curriculum.synthetic.section.version.revise','section',target.section_id,
      jsonb_build_object('organizationId',org_id,'siteId',site_id,'programId',program_id),
      jsonb_build_object('courseTemplateVersionId',target.old_version_id,'priorLessonProgressRows',old_progress),
      jsonb_build_object('courseTemplateVersionId',target.new_version_id,'packVersionId',new_pack_version,
        'reason',release_note,'studentPreview',true,'notForCredit',true),
      jsonb_build_object('actor','user_directed_operator_release','synthetic',true));
  END LOOP;

  IF (SELECT COUNT(*) FROM sections s JOIN course_template_versions v ON v.id=s.course_template_version_id
       JOIN course_templates c ON c.id=v.course_template_id
       WHERE s.program_id=program_id AND s.code IN('CAN-ALG1','CAN-BIO','CAN-ENG9','CAN-USHIST')
         AND v.status='published' AND v.curriculum#>>'{source,studentRelease}'='synthetic_valor_preview_2026-11'
         AND s.active)=4
    AND (SELECT COUNT(*) FROM curriculum_adoptions WHERE program_id=program_id AND pack_version_id=new_pack_version AND status='active')=1
    AND (SELECT COUNT(*) FROM curriculum_pack_items WHERE pack_version_id=new_pack_version)=32
  THEN RAISE NOTICE 'Valor synthetic student release complete: 4 published courses, 4 switched sections, v3 pack adopted (32 courses), no credit approval or grade changes.';
  ELSE RAISE EXCEPTION 'Valor synthetic release verification failed, rolling back'; END IF;
END $valor_release$;