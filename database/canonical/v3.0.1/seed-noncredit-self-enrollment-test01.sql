-- TEST ONLY: disposable Neon branch test01, never production.
-- Synthetic release data, no valid accreditation/content or real learners.
-- Intended to exercise existing provider/learner read models and DB guards.
-- Run only with the explicit test01 branch and controlled isolated account(s).
INSERT INTO education_v30.organizations (id,legal_name,display_name,status,metadata) VALUES ('aa110000-0000-4000-8000-000000000001','TEST ONLY CAN Enrollment QA','TEST ONLY - Enrollment QA Provider','active','{"qa_only":true,"intended_branch":"test01","purpose":"isolated enrollment regression"}'::jsonb) ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.persons (id,preferred_name) VALUES ('aa140000-0000-4000-8000-000000000001','TEST ONLY Course Author'),('aa140000-0000-4000-8000-000000000002','TEST ONLY Independent Reviewer') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.sites (id,code,name,site_kind,status,capacity) VALUES ('aa120000-0000-4000-8000-000000000001','QA-SELF-A','TEST ONLY - Enrollment Lab Site A','physical','active',25),('aa120000-0000-4000-8000-000000000002','QA-SELF-B','TEST ONLY - Enrollment Lab Site B','physical','active',25) ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.education_operations (id,code,name,kind_code,status,web_identity) VALUES ('aa130000-0000-4000-8000-000000000001','QA-SELF-OP','TEST ONLY - Enrollment QA Operation','training_center','active','{"qa_only":true}'::jsonb) ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.education_operation_organization_roles (operation_id,organization_id,role_code,valid_from,status) VALUES ('aa130000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','operator','2026-01-01T00:00:00Z','approved') ON CONFLICT DO NOTHING;

INSERT INTO education_v30.site_organization_roles (site_id,organization_id,role_code,valid_from) VALUES ('aa120000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','host','2026-01-01T00:00:00Z'),('aa120000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000001','host','2026-01-01T00:00:00Z') ON CONFLICT DO NOTHING;

INSERT INTO education_v30.education_operation_sites (operation_id,site_id,valid_from,purpose) VALUES ('aa130000-0000-4000-8000-000000000001','aa120000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z','test_only_enrollment'),('aa130000-0000-4000-8000-000000000001','aa120000-0000-4000-8000-000000000002','2026-01-01T00:00:00Z','test_only_enrollment') ON CONFLICT DO NOTHING;

INSERT INTO education_v30.offerings (id,publisher_organization_id,code,title,status) VALUES ('aa150000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','QA-SELF-1','TEST ONLY - Independent QA Training','active') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.offering_versions (id,offering_id,version_no,lifecycle,product_definition) VALUES ('aa160000-0000-4000-8000-000000000001','aa150000-0000-4000-8000-000000000001',1,'draft','{"qa_only":true,"noncredit":true}'::jsonb) ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.courses (id,publisher_organization_id,course_code,title,subject) VALUES ('aa170000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','QA-COURSE-1','TEST ONLY - Independent QA Training','Noncredit QA') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.course_versions (id,course_id,version_no,syllabus,lifecycle,published_at) VALUES ('aa180000-0000-4000-8000-000000000001','aa170000-0000-4000-8000-000000000001',1,'{"qa_only":true,"course_material":"synthetic metadata, no real instruction"}'::jsonb,'published',now()-interval '1 day') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.offering_courses (offering_version_id,course_version_id,is_required,sequence_no) VALUES ('aa160000-0000-4000-8000-000000000001','aa180000-0000-4000-8000-000000000001',true,1) ON CONFLICT DO NOTHING;

INSERT INTO education_v30.offering_release_requirements (offering_version_id,course_version_id,minimum_approved_primary_tracks,complete_lesson_coverage_required,independent_academic_review_required,rights_clearance_required,accessibility_review_required) VALUES ('aa160000-0000-4000-8000-000000000001','aa180000-0000-4000-8000-000000000001',0,false,false,false,false) ON CONFLICT DO NOTHING;

UPDATE education_v30.offering_versions SET lifecycle='published',published_at=now()-interval '1 day' WHERE id='aa160000-0000-4000-8000-000000000001' AND lifecycle='draft';

INSERT INTO education_v30.noncredit_training_versions (id,offering_version_id,provider_organization_id,title,required_instruction_minutes,state,published_at,author_person_id,approved_by_person_id) VALUES ('aa210000-0000-4000-8000-000000000001','aa160000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','TEST ONLY - Independent QA Training',10,'published',now()-interval '1 day','aa140000-0000-4000-8000-000000000001','aa140000-0000-4000-8000-000000000002') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.noncredit_completion_policies (id,training_version_id,policy_version,min_participation_minutes,skills_assessment_required,effective_at,approved_by_person_id,completion_mode) VALUES ('aa220000-0000-4000-8000-000000000001','aa210000-0000-4000-8000-000000000001',1,0,false,now()-interval '1 day','aa140000-0000-4000-8000-000000000002','provider_review') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.program_deployments (id,operation_id,offering_id,code,name,status) VALUES ('aa190000-0000-4000-8000-000000000001','aa130000-0000-4000-8000-000000000001','aa150000-0000-4000-8000-000000000001','QA-DEP-1','TEST ONLY - Independent QA Training Delivery','active') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.deployment_offering_adoptions (id,deployment_id,offering_id,offering_version_id,valid_from,approval_status,approved_by_person_id,approved_at) VALUES ('aa200000-0000-4000-8000-000000000001','aa190000-0000-4000-8000-000000000001','aa150000-0000-4000-8000-000000000001','aa160000-0000-4000-8000-000000000001',now()-interval '1 day','approved','aa140000-0000-4000-8000-000000000002',now()-interval '1 day') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.noncredit_self_enrollment_releases (id,deployment_id,adoption_id,offering_version_id,training_version_id,course_version_id,provider_organization_id,registering_organization_id,site_id,delivery_mode,opens_at,closes_at,max_participants,consent_version,consent_text,published_by_person_id) VALUES ('aa230000-0000-4000-8000-000000000001','aa190000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001','aa160000-0000-4000-8000-000000000001','aa210000-0000-4000-8000-000000000001','aa180000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001',NULL,'independent',now()-interval '1 hour',now()+interval '14 days',2,'qa-v1','TEST ONLY: Synthetic training for isolated enrollment testing. No real credit, credential, instruction or student records will be issued.','aa140000-0000-4000-8000-000000000002') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.offerings (id,publisher_organization_id,code,title,status) VALUES ('aa150000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000001','QA-SELF-2','TEST ONLY - Site A Facilitated QA Training','active') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.offering_versions (id,offering_id,version_no,lifecycle,product_definition) VALUES ('aa160000-0000-4000-8000-000000000002','aa150000-0000-4000-8000-000000000002',1,'draft','{"qa_only":true,"noncredit":true}'::jsonb) ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.courses (id,publisher_organization_id,course_code,title,subject) VALUES ('aa170000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000001','QA-COURSE-2','TEST ONLY - Site A Facilitated QA Training','Noncredit QA') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.course_versions (id,course_id,version_no,syllabus,lifecycle,published_at) VALUES ('aa180000-0000-4000-8000-000000000002','aa170000-0000-4000-8000-000000000002',1,'{"qa_only":true,"course_material":"synthetic metadata, no real instruction"}'::jsonb,'published',now()-interval '1 day') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.offering_courses (offering_version_id,course_version_id,is_required,sequence_no) VALUES ('aa160000-0000-4000-8000-000000000002','aa180000-0000-4000-8000-000000000002',true,1) ON CONFLICT DO NOTHING;

INSERT INTO education_v30.offering_release_requirements (offering_version_id,course_version_id,minimum_approved_primary_tracks,complete_lesson_coverage_required,independent_academic_review_required,rights_clearance_required,accessibility_review_required) VALUES ('aa160000-0000-4000-8000-000000000002','aa180000-0000-4000-8000-000000000002',0,false,false,false,false) ON CONFLICT DO NOTHING;

UPDATE education_v30.offering_versions SET lifecycle='published',published_at=now()-interval '1 day' WHERE id='aa160000-0000-4000-8000-000000000002' AND lifecycle='draft';

INSERT INTO education_v30.noncredit_training_versions (id,offering_version_id,provider_organization_id,title,required_instruction_minutes,state,published_at,author_person_id,approved_by_person_id) VALUES ('aa210000-0000-4000-8000-000000000002','aa160000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000001','TEST ONLY - Site A Facilitated QA Training',10,'published',now()-interval '1 day','aa140000-0000-4000-8000-000000000001','aa140000-0000-4000-8000-000000000002') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.noncredit_completion_policies (id,training_version_id,policy_version,min_participation_minutes,skills_assessment_required,effective_at,approved_by_person_id,completion_mode) VALUES ('aa220000-0000-4000-8000-000000000002','aa210000-0000-4000-8000-000000000002',1,0,false,now()-interval '1 day','aa140000-0000-4000-8000-000000000002','provider_review') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.program_deployments (id,operation_id,offering_id,code,name,status) VALUES ('aa190000-0000-4000-8000-000000000002','aa130000-0000-4000-8000-000000000001','aa150000-0000-4000-8000-000000000002','QA-DEP-2','TEST ONLY - Site A Facilitated QA Training Delivery','active') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.deployment_offering_adoptions (id,deployment_id,offering_id,offering_version_id,valid_from,approval_status,approved_by_person_id,approved_at) VALUES ('aa200000-0000-4000-8000-000000000002','aa190000-0000-4000-8000-000000000002','aa150000-0000-4000-8000-000000000002','aa160000-0000-4000-8000-000000000002',now()-interval '1 day','approved','aa140000-0000-4000-8000-000000000002',now()-interval '1 day') ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.deployment_sites (deployment_id,site_id,purpose) VALUES ('aa190000-0000-4000-8000-000000000002','aa120000-0000-4000-8000-000000000001','delivery') ON CONFLICT DO NOTHING;

INSERT INTO education_v30.noncredit_self_enrollment_releases (id,deployment_id,adoption_id,offering_version_id,training_version_id,course_version_id,provider_organization_id,registering_organization_id,site_id,delivery_mode,opens_at,closes_at,max_participants,consent_version,consent_text,published_by_person_id) VALUES ('aa230000-0000-4000-8000-000000000002','aa190000-0000-4000-8000-000000000002','aa200000-0000-4000-8000-000000000002','aa160000-0000-4000-8000-000000000002','aa210000-0000-4000-8000-000000000002','aa180000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','aa120000-0000-4000-8000-000000000001','facilitated',now()-interval '1 hour',now()+interval '14 days',1,'qa-v1','TEST ONLY: Synthetic training for isolated enrollment testing. No real credit, credential, instruction or student records will be issued.','aa140000-0000-4000-8000-000000000002') ON CONFLICT (id) DO NOTHING;
