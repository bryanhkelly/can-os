-- Canonical planning seed for the already-persisted synthetic Community Learning Center.
-- One primary Neon database. No bridge or approved Site identity rows are created.
-- Every row is intentionally NOT operational: prospective Organization, planning Site,
-- draft Course version, and no Class, Enrollment, attendance or award.
-- Idempotent inserts use fixed synthetic IDs for source reconciliation.
INSERT INTO education_v30.organizations (id,legal_name,display_name,external_reference,status,metadata)
VALUES ('ca270000-0000-4000-8000-000000000001','CAN Community Learning Center (Synthetic Demo)','CAN Community Learning Center (Demo)','synthetic:can-clc-demo','prospective',
'{"synthetic":true,"purpose":"after-school-and-summer-planning","publicOrganizationId":"ca270000-0000-4000-8000-000000000001","approval":"not_requested"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.sites (id,code,name,site_kind,address,time_zone,status)
VALUES ('ca270000-0000-4000-8000-000000000002','CLC-DEMO-01','CAN Community Learning Center (Demo)','physical','{"synthetic":true,"addressVerified":false}'::jsonb,'America/Los_Angeles','planning')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.courses (id,publisher_organization_id,course_code,title,subject)
VALUES ('ca270000-0000-4000-8000-000000000041','ca270000-0000-4000-8000-000000000001','CLC-AI-DIGITAL-01','AI and Digital Skills','Digital literacy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.course_versions (id,course_id,version_no,syllabus,lifecycle,published_at)
VALUES ('ca270000-0000-4000-8000-000000000042','ca270000-0000-4000-8000-000000000041',1,
'{"synthetic":true,"status":"planning","audience":"After-school and summer learners, grades 6-12","description":"Introductory digital literacy and responsible use of AI.","creditMode":"non_credit","plannedDelivery":"facilitated","courseObjectives":["Write a useful prompt with appropriate context","Verify important AI-generated claims","Protect private information"],"requirements":"Requires independent curriculum review, verified publisher appointment, authorized local adoption, and youth safeguarding before release"}'::jsonb,
'draft',NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.course_units (id,course_version_id,unit_key,title,sequence_no,content)
VALUES ('ca270000-0000-4000-8000-000000000043','ca270000-0000-4000-8000-000000000042','foundations','Responsible AI foundations',1,
'{"synthetic":true,"instruction":"Recorded teacher + live facilitator","estimatedMinutes":35}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.course_lessons (id,course_version_id,course_unit_id,lesson_key,title,lesson_order,content)
VALUES ('ca270000-0000-4000-8000-000000000044','ca270000-0000-4000-8000-000000000042','ca270000-0000-4000-8000-000000000043','ask-better-questions','Session 1: Ask Better Questions',1,
'{"synthetic":true,"estimatedMinutes":35,"objectives":["Write a prompt with an audience and goal","Check one AI claim with a trusted source","Identify information that must remain private"],"segments":[{"title":"Welcome","minutes":5},{"title":"Prompt design","minutes":8},{"title":"Verify claims","minutes":8},{"title":"Privacy","minutes":7},{"title":"Exit reflection","minutes":7}],"mediaStatus":"not_uploaded","assessmentStatus":"not_published","requiresIndependentReview":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
