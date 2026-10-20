-- Synthetic-only Curriculum Studio fixture. Never apply to real-data environments.
-- Depends on new-experiences-v1.sql and the base fixture manifest seeds.
BEGIN;
INSERT INTO memberships (person_id, organization_id, title, metadata)
VALUES ('f7000000-0000-4000-8000-000000000001',
 'f1000000-0000-4000-8000-000000000002','Synthetic curriculum publisher','{"synthetic":true}')
ON CONFLICT (person_id, organization_id) DO NOTHING;

INSERT INTO role_assignments (id, person_id, organization_id, site_id, program_id, role_key, capabilities, metadata)
VALUES ('c7200000-0000-4000-8000-000000000001',
 'f7000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002',
 'f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004',
 'curriculum_publisher','["curriculum.publish"]','{"synthetic":true}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO course_templates (id, owning_organization_id, code, title, subject, metadata)
VALUES ('c7200000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002',
 'SYNTH-CURRICULUM','Synthetic Curriculum Workshop','Science','{"synthetic":true}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO course_template_versions (id, course_template_id, version, status, curriculum)
VALUES ('c7200000-0000-4000-8000-000000000003','c7200000-0000-4000-8000-000000000002',
 1,'draft','{"learning":{"version":1,"syllabus":"Synthetic introductory science curriculum.",
 "modules":[{"id":"synthetic-module","title":"Observation","lessons":[{"id":"synthetic-lesson",
 "title":"Observe and record","body":"Write three observations and explain the evidence for each.","resources":[]}]}],"resources":[]}}')
ON CONFLICT (id) DO NOTHING;
COMMIT;
