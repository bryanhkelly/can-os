-- CAN OS v3.0.1 synthetic two-learner recorded-instructor acceptance fixture.
-- FOR NEON db3.01 ONLY: project sweet-hall-62441909, branch br-tiny-mode-arh9wa2e.
-- Requires the canonical v3.0.1 schema and the Valor/Barton native demo seeds.
-- One-shot test fixture. Contains *no actual media or production content rights*.
-- Two learners share one Section; they select different approved, synthetic recorded tracks.
-- The Offering stays draft until two independently reviewed tracks have distribution rights.
-- Content manifests start as drafts, require independent review, then become approved.
-- THIS IS NOT A REPLACEMENT FOR restricted-login authorization or real-content acceptance.

-- Step 1
DO $can_fixture$ BEGIN
  IF current_setting('neon.project_id',true) <> 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) <> 'br-tiny-mode-arh9wa2e'
  THEN RAISE EXCEPTION 'Recorded-instructor fixture requires db3.01'; END IF;
  IF to_regclass('education_v30.learner_course_attempts') IS NULL
    OR EXISTS (SELECT 1 FROM education_v30.courses WHERE id='b3010000-0000-4000-8000-000000000001')
  THEN RAISE EXCEPTION 'Canonical baseline missing or recorded fixture already loaded'; END IF;
END $can_fixture$;

-- Step 2
INSERT INTO education_v30.persons (id,legal_first_name,legal_last_name,preferred_name)
 VALUES ('b3010000-0000-4000-8000-000000000009','Synthetic','Learner A','Learner A'),
 ('b3010000-0000-4000-8000-000000000010','Synthetic','Learner B','Learner B'),
 ('b3010000-0000-4000-8000-000000000017','Synthetic','Instructor A','Instructor A'),
 ('b3010000-0000-4000-8000-000000000018','Synthetic','Instructor B','Instructor B');

-- Step 3
INSERT INTO education_v30.learner_profiles (id,person_id,metadata)
 VALUES ('b3010000-0000-4000-8000-000000000011','b3010000-0000-4000-8000-000000000009','{"synthetic":true}'::jsonb),
 ('b3010000-0000-4000-8000-000000000012','b3010000-0000-4000-8000-000000000010','{"synthetic":true}'::jsonb);

-- Step 4
INSERT INTO education_v30.courses (id,publisher_organization_id,course_code,title,subject)
 VALUES ('b3010000-0000-4000-8000-000000000001','11110000-0000-4000-8000-000000000003','can-demo-recorded-instructor-acceptance','Synthetic Digital Skills Foundations','digital-skills');

-- Step 5
INSERT INTO education_v30.course_versions (id,course_id,version_no,syllabus,lifecycle)
 VALUES ('b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000001',1,'{"demo_only":true}'::jsonb,'draft');

-- Step 6
INSERT INTO education_v30.course_units (id,course_version_id,unit_key,title,sequence_no)
 VALUES ('b3010000-0000-4000-8000-000000000003','b3010000-0000-4000-8000-000000000002','foundations','Introduction',1);

-- Step 7
INSERT INTO education_v30.course_lessons (id,course_version_id,course_unit_id,lesson_key,title,lesson_order)
 VALUES ('b3010000-0000-4000-8000-000000000004','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000003','intro','Introduction to Digital Skills',1);

-- Step 8
INSERT INTO education_v30.official_course_assignment_versions
 (id,course_version_id,assignment_key,official_spec,required,weight)
 VALUES ('b3010000-0000-4000-8000-000000000046','b3010000-0000-4000-8000-000000000002','intro-reflection','{"synthetic":true,"title":"Digital Skills Reflection"}'::jsonb,true,1);

-- Step 9
UPDATE education_v30.course_versions SET lifecycle='published',published_at=clock_timestamp() WHERE id='b3010000-0000-4000-8000-000000000002';

-- Step 10
INSERT INTO education_v30.offering_versions (id,offering_id,version_no,product_definition,lifecycle)
 VALUES ('b3010000-0000-4000-8000-000000000005','cccc0000-0000-4000-8000-000000000001',2,'{"demo_only":true,"recorded_instruction":true}'::jsonb,'draft');

-- Step 11
INSERT INTO education_v30.offering_courses (offering_version_id,course_version_id,is_required,sequence_no)
 VALUES ('b3010000-0000-4000-8000-000000000005','b3010000-0000-4000-8000-000000000002',true,1);

-- Step 12
INSERT INTO education_v30.offering_release_requirements
 (offering_version_id,course_version_id,minimum_approved_primary_tracks,complete_lesson_coverage_required,
 independent_academic_review_required,rights_clearance_required,accessibility_review_required)
 VALUES ('b3010000-0000-4000-8000-000000000005','b3010000-0000-4000-8000-000000000002',
 2,true,true,true,true);

-- Step 13
INSERT INTO education_v30.program_deployments (id,operation_id,offering_id,code,name,status)
 VALUES ('b3010000-0000-4000-8000-000000000006','88880000-0000-4000-8000-000000000001','cccc0000-0000-4000-8000-000000000001','v301-recorded-instructors','Synthetic Recorded Instruction','active');

-- Step 14
INSERT INTO education_v30.instructional_tracks
 (id,course_id,presenter_person_id,producer_organization_id,title)
 VALUES ('b3010000-0000-4000-8000-000000000019','b3010000-0000-4000-8000-000000000001','b3010000-0000-4000-8000-000000000017','11110000-0000-4000-8000-000000000003','Recorded Instructor A'),
 ('b3010000-0000-4000-8000-000000000020','b3010000-0000-4000-8000-000000000001','b3010000-0000-4000-8000-000000000018','11110000-0000-4000-8000-000000000003','Recorded Instructor B');

-- Step 15
INSERT INTO education_v30.instructional_track_versions
 (id,instructional_track_id,course_version_id,course_id,created_by_person_id,version_no,lifecycle,track_kind)
 VALUES ('b3010000-0000-4000-8000-000000000021','b3010000-0000-4000-8000-000000000019','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000001','44440000-0000-4000-8000-000000000001',1,'draft','primary'),
 ('b3010000-0000-4000-8000-000000000022','b3010000-0000-4000-8000-000000000020','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000001','44440000-0000-4000-8000-000000000001',1,'draft','primary');

-- Step 16
INSERT INTO education_v30.content_assets (id,owner_organization_id,title,kind)
 VALUES ('b3010000-0000-4000-8000-000000000023','11110000-0000-4000-8000-000000000003','SYNTHETIC placeholder A: no actual playback','video'),
 ('b3010000-0000-4000-8000-000000000024','11110000-0000-4000-8000-000000000003','SYNTHETIC placeholder B: no actual playback','video');

-- Step 17
INSERT INTO education_v30.content_asset_versions
 (id,asset_id,version_no,license_terms,lifecycle,published_at)
 VALUES ('b3010000-0000-4000-8000-000000000025','b3010000-0000-4000-8000-000000000023',1,'{"demo_only":true,"no_media":true}'::jsonb,'published',clock_timestamp()),
 ('b3010000-0000-4000-8000-000000000026','b3010000-0000-4000-8000-000000000024',1,'{"demo_only":true,"no_media":true}'::jsonb,'published',clock_timestamp());

-- Step 18
INSERT INTO education_v30.track_lesson_presentations
 (id,track_version_id,course_version_id,course_lesson_id,asset_version_id,presentation_kind,ordinal)
 VALUES ('b3010000-0000-4000-8000-000000000031','b3010000-0000-4000-8000-000000000021','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000004','b3010000-0000-4000-8000-000000000025','primary',1),
 ('b3010000-0000-4000-8000-000000000032','b3010000-0000-4000-8000-000000000022','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000004','b3010000-0000-4000-8000-000000000026','primary',1);

-- Step 19
INSERT INTO education_v30.evidence_documents
 (id,kind_code,owning_organization_id,title,privacy_class)
 VALUES ('b3010000-0000-4000-8000-000000000027','rights','11110000-0000-4000-8000-000000000003','SYNTHETIC ONLY: test rights, no real media clearance','internal');

-- Step 20
INSERT INTO education_v30.evidence_document_versions
 (id,document_id,version_no,verified_by_person_id,verified_at,valid_from,valid_through)
 VALUES ('b3010000-0000-4000-8000-000000000028','b3010000-0000-4000-8000-000000000027',1,'44440000-0000-4000-8000-000000000003',clock_timestamp(),CURRENT_DATE - 1,CURRENT_DATE + 365);

-- Step 21
INSERT INTO education_v30.content_publication_manifests
 (id,owner_organization_id,track_version_id,manifest_hash,manifest_status,created_by_person_id)
 VALUES ('b3010000-0000-4000-8000-000000000029','11110000-0000-4000-8000-000000000003','b3010000-0000-4000-8000-000000000021','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','draft','44440000-0000-4000-8000-000000000001'),
 ('b3010000-0000-4000-8000-000000000030','11110000-0000-4000-8000-000000000003','b3010000-0000-4000-8000-000000000022','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','draft','44440000-0000-4000-8000-000000000001');

-- Step 22
INSERT INTO education_v30.content_publication_manifest_items
 (id,manifest_id,content_asset_version_id,usage_kind,content_hash,rights_evidence_version_id)
 VALUES ('b3010000-0000-4000-8000-000000000033','b3010000-0000-4000-8000-000000000029','b3010000-0000-4000-8000-000000000025','required_instruction','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','b3010000-0000-4000-8000-000000000028'),
 ('b3010000-0000-4000-8000-000000000034','b3010000-0000-4000-8000-000000000030','b3010000-0000-4000-8000-000000000026','required_instruction','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','b3010000-0000-4000-8000-000000000028');

-- Step 23
INSERT INTO education_v30.content_manifest_review_decisions
 (manifest_id,review_kind,reviewer_person_id,decision,evidence_version_id)
 SELECT m.id,k.kind,'44440000-0000-4000-8000-000000000003','approved','b3010000-0000-4000-8000-000000000028'
 FROM education_v30.content_publication_manifests m
 CROSS JOIN (VALUES ('academic'),('rights'),('accessibility')) k(kind)
 WHERE m.id IN ('b3010000-0000-4000-8000-000000000029','b3010000-0000-4000-8000-000000000030');

-- Step 24
UPDATE education_v30.content_publication_manifests SET manifest_status='approved'
 WHERE id IN ('b3010000-0000-4000-8000-000000000029','b3010000-0000-4000-8000-000000000030');

-- Step 25
UPDATE education_v30.instructional_track_versions SET
 submission_manifest_hash=CASE id WHEN 'b3010000-0000-4000-8000-000000000021' THEN 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' ELSE 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' END,
 submitted_by_person_id='44440000-0000-4000-8000-000000000001', submitted_at=clock_timestamp()
 WHERE id IN ('b3010000-0000-4000-8000-000000000021','b3010000-0000-4000-8000-000000000022');

-- Step 26
INSERT INTO education_v30.instructional_track_reviews
 (track_version_id,manifest_hash,reviewer_person_id,review_kind,decision,rationale)
 SELECT v.id,v.submission_manifest_hash,'44440000-0000-4000-8000-000000000003',k.kind,'approved',
 'SYNTHETIC acceptance-only independent review, no actual production rights'
 FROM education_v30.instructional_track_versions v
 CROSS JOIN (VALUES ('academic'),('rights'),('accessibility'),('coverage'),('safeguarding')) k(kind)
 WHERE v.id IN ('b3010000-0000-4000-8000-000000000021','b3010000-0000-4000-8000-000000000022');

-- Step 27
UPDATE education_v30.instructional_track_versions SET lifecycle='published',published_at=clock_timestamp()
 WHERE id IN ('b3010000-0000-4000-8000-000000000021','b3010000-0000-4000-8000-000000000022');

-- Step 28
INSERT INTO education_v30.track_distribution_authorizations
 (id,track_version_id,approved_offering_id,approved_operation_id,valid_from,status,rights_evidence_version_id)
 VALUES ('b3010000-0000-4000-8000-000000000035','b3010000-0000-4000-8000-000000000021','cccc0000-0000-4000-8000-000000000001','88880000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z','approved','b3010000-0000-4000-8000-000000000028'),
 ('b3010000-0000-4000-8000-000000000036','b3010000-0000-4000-8000-000000000022','cccc0000-0000-4000-8000-000000000001','88880000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z','approved','b3010000-0000-4000-8000-000000000028');

-- Step 29
UPDATE education_v30.offering_versions SET lifecycle='published',published_at=clock_timestamp() WHERE id='b3010000-0000-4000-8000-000000000005';

-- Step 30
INSERT INTO education_v30.deployment_offering_adoptions
 (id,deployment_id,offering_id,offering_version_id,valid_from,approval_status,approved_by_person_id,approved_at)
 VALUES ('b3010000-0000-4000-8000-000000000007','b3010000-0000-4000-8000-000000000006','cccc0000-0000-4000-8000-000000000001','b3010000-0000-4000-8000-000000000005','2026-01-01T00:00:00Z','approved','44440000-0000-4000-8000-000000000001',clock_timestamp());

-- Step 31
INSERT INTO education_v30.course_sections
 (id,deployment_id,adoption_id,offering_version_id,course_version_id,section_code,title)
 VALUES ('b3010000-0000-4000-8000-000000000008','b3010000-0000-4000-8000-000000000006','b3010000-0000-4000-8000-000000000007','b3010000-0000-4000-8000-000000000005','b3010000-0000-4000-8000-000000000002','SYNTH-REC-001','Synthetic Recording Section');

-- Step 32
INSERT INTO education_v30.enrollments (id,learner_id,deployment_id,status)
 VALUES ('b3010000-0000-4000-8000-000000000013','b3010000-0000-4000-8000-000000000011','b3010000-0000-4000-8000-000000000006','active'),
 ('b3010000-0000-4000-8000-000000000014','b3010000-0000-4000-8000-000000000012','b3010000-0000-4000-8000-000000000006','active');

-- Step 33
INSERT INTO education_v30.learner_course_attempts
 (id,enrollment_id,deployment_id,adoption_id,offering_version_id,course_version_id,section_id,attempt_no,status)
 VALUES ('b3010000-0000-4000-8000-000000000015','b3010000-0000-4000-8000-000000000013','b3010000-0000-4000-8000-000000000006','b3010000-0000-4000-8000-000000000007','b3010000-0000-4000-8000-000000000005','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000008',1,'active'),
 ('b3010000-0000-4000-8000-000000000016','b3010000-0000-4000-8000-000000000014','b3010000-0000-4000-8000-000000000006','b3010000-0000-4000-8000-000000000007','b3010000-0000-4000-8000-000000000005','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000008',1,'active');

-- Step 34
INSERT INTO education_v30.instructional_track_policy_versions
 (id,deployment_id,adoption_id,offering_version_id,course_version_id,version_no,authoring_enabled,
  student_choice_enabled,practice_enabled,delivery_enabled,selection_policy,allow_switching,
  lifecycle,effective_from,created_by_person_id,published_by_person_id,published_at)
 VALUES ('b3010000-0000-4000-8000-000000000037','b3010000-0000-4000-8000-000000000006','b3010000-0000-4000-8000-000000000007','b3010000-0000-4000-8000-000000000005','b3010000-0000-4000-8000-000000000002',1,true,true,true,true,'student',true,
  'published','2026-02-01T00:00:00Z','44440000-0000-4000-8000-000000000001','44440000-0000-4000-8000-000000000003',clock_timestamp());

-- Step 35
INSERT INTO education_v30.learner_track_selections
 (id,course_attempt_id,course_version_id,track_version_id,policy_version_id,revision,
  selected_at,selected_by_person_id,selection_source)
 VALUES ('b3010000-0000-4000-8000-000000000038','b3010000-0000-4000-8000-000000000015','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000021','b3010000-0000-4000-8000-000000000037',1,clock_timestamp(),'b3010000-0000-4000-8000-000000000009','learner'),
 ('b3010000-0000-4000-8000-000000000039','b3010000-0000-4000-8000-000000000016','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000022','b3010000-0000-4000-8000-000000000037',1,clock_timestamp(),'b3010000-0000-4000-8000-000000000010','learner');

-- Step 36
INSERT INTO education_v30.learner_lesson_progress
 (id,course_attempt_id,course_version_id,lesson_id,status)
 VALUES ('b3010000-0000-4000-8000-000000000040','b3010000-0000-4000-8000-000000000015','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000004','in_progress'),
 ('b3010000-0000-4000-8000-000000000041','b3010000-0000-4000-8000-000000000016','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000004','completed');

-- Step 37
INSERT INTO education_v30.formative_practice_attempts
 (id,course_attempt_id,course_version_id,track_version_id,policy_version_id,course_unit_id,score_numeric)
 VALUES ('b3010000-0000-4000-8000-000000000042','b3010000-0000-4000-8000-000000000015','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000021','b3010000-0000-4000-8000-000000000037','b3010000-0000-4000-8000-000000000003',8),
 ('b3010000-0000-4000-8000-000000000043','b3010000-0000-4000-8000-000000000016','b3010000-0000-4000-8000-000000000002','b3010000-0000-4000-8000-000000000022','b3010000-0000-4000-8000-000000000037','b3010000-0000-4000-8000-000000000003',9);

-- Step 38
INSERT INTO education_v30_secure.formative_practice_responses (practice_attempt_id,response)
 VALUES ('b3010000-0000-4000-8000-000000000042','{"synthetic":true,"answers":{"q1":"A"}}'::jsonb),
 ('b3010000-0000-4000-8000-000000000043','{"synthetic":true,"answers":{"q1":"B"}}'::jsonb);

-- Step 39
INSERT INTO education_v30.official_course_grades
 (id,course_attempt_id,issuer_organization_id,grade_value,status)
 VALUES ('b3010000-0000-4000-8000-000000000044','b3010000-0000-4000-8000-000000000015','11110000-0000-4000-8000-000000000001','In Progress','draft'),
 ('b3010000-0000-4000-8000-000000000045','b3010000-0000-4000-8000-000000000016','11110000-0000-4000-8000-000000000001','In Progress','draft');
