-- CAN OS release fixture: deterministic, synthetic-only, idempotent.
-- All UUIDs are reserved for demonstration data. Do not use real student PII.
-- Sequential INSERT statements (not a single WITH chain): the BEFORE INSERT
-- trigger on calendar_events inserts scheduled_occurrences rows whose FK checks
-- cannot see sibling CTE inserts from the same statement.
INSERT INTO jurisdictions(id,code,name,region_code) VALUES
('f1000000-0000-4000-8000-000000000001','SYNTH-CA-2026','Synthetic California','CA')
ON CONFLICT(id) DO NOTHING;
INSERT INTO organizations(id,type,name,slug,metadata) VALUES
('f1000000-0000-4000-8000-000000000002','christian_school','CAN Synthetic Demonstration School','can-synthetic-demo', '{"synthetic":true,"release":"student-s1-s4"}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO sites(id,organization_id,name,slug,timezone,metadata) VALUES
('f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000002','Synthetic Bay Campus','synthetic-bay','America/Los_Angeles','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO programs(id,organization_id,site_id,jurisdiction_id,type,status,name,slug,grade_range,delivery_model,host_organization_id,academic_provider_organization_id,credit_issuing_organization_id,metadata) VALUES
('f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','high_school_extension','active','Synthetic Hybrid High School','synthetic-hybrid','{"min":"9","max":"12"}'::jsonb,'{"onsite":true,"asynchronous":true,"liveOnline":true}'::jsonb,'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata) VALUES
('f1000000-0000-4000-8000-000000000005','Jordan','Example','Jordan','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000006','Riley','Example','Riley','{"synthetic":true,"role":"teacher"}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO student_profiles(id,person_id,grade_level,metadata) VALUES
('f1000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000005','10','{"synthetic":true,"release":"student-s1-s4"}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO grade_scales(id,owning_organization_id,name,version,configuration) VALUES
('f1000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000002','Synthetic Standard',1,'{"entries":[{"label":"A","minPercent":90,"maxPercent":100,"gpaPoints":4},{"label":"B","minPercent":80,"maxPercent":89.99,"gpaPoints":3},{"label":"C","minPercent":70,"maxPercent":79.99,"gpaPoints":2},{"label":"F","minPercent":0,"maxPercent":69.99,"gpaPoints":0}]}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO school_years(id,organization_id,program_id,site_id,key,name,status,starts_on,ends_on,grade_scale_id,timezone,metadata) VALUES
('f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','2026-2027-synthetic','2026–2027 Synthetic','active','2026-08-17','2027-06-04','f1000000-0000-4000-8000-000000000008','America/Los_Angeles','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO terms(id,school_year_id,key,name,sequence,starts_on,ends_on) VALUES
('f1000000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000009','fall','Fall',1,'2026-08-17','2026-12-18')
ON CONFLICT(id) DO NOTHING;
INSERT INTO academic_calendars(id,school_year_id,site_id,name,version,active) VALUES
('f1000000-0000-4000-8000-000000000011','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000003','Synthetic Site Calendar',1,true)
ON CONFLICT(id) DO NOTHING;
INSERT INTO course_templates(id,owning_organization_id,code,title,subject,metadata) VALUES
('f1000000-0000-4000-8000-000000000020','f1000000-0000-4000-8000-000000000002','ENG-S','English Literature','English','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000021','f1000000-0000-4000-8000-000000000002','BIO-S','Biology','Science','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000022','f1000000-0000-4000-8000-000000000002','ALG-S','Algebra II','Mathematics','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000023','f1000000-0000-4000-8000-000000000002','HIS-S','World History','History','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO course_template_versions(id,course_template_id,version,status) VALUES
('f1000000-0000-4000-8000-000000000030','f1000000-0000-4000-8000-000000000020',1,'published'),
('f1000000-0000-4000-8000-000000000031','f1000000-0000-4000-8000-000000000021',1,'published'),
('f1000000-0000-4000-8000-000000000032','f1000000-0000-4000-8000-000000000022',1,'published'),
('f1000000-0000-4000-8000-000000000033','f1000000-0000-4000-8000-000000000023',1,'published')
ON CONFLICT(id) DO NOTHING;
INSERT INTO sections(id,program_id,site_id,course_template_version_id,code,title,term_id,active,metadata) VALUES
('f1000000-0000-4000-8000-000000000040','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000030','ENG-S','English Literature','f1000000-0000-4000-8000-000000000010',true,'{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000041','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000031','BIO-S','Biology','f1000000-0000-4000-8000-000000000010',true,'{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000042','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000032','ALG-S','Algebra II','f1000000-0000-4000-8000-000000000010',true,'{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000043','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000033','HIS-S','World History','f1000000-0000-4000-8000-000000000010',true,'{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO enrollments(id,student_profile_id,kind,status,organization_id,program_id,section_id,school_year_id,started_at,metadata) VALUES
('f1000000-0000-4000-8000-000000000054','f1000000-0000-4000-8000-000000000007','program','active','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004',NULL,'f1000000-0000-4000-8000-000000000009','2026-08-17T08:00:00Z','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000050','f1000000-0000-4000-8000-000000000007','section','active','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000040','f1000000-0000-4000-8000-000000000009','2026-08-17T08:00:00Z','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000051','f1000000-0000-4000-8000-000000000007','section','active','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000041','f1000000-0000-4000-8000-000000000009','2026-08-17T08:00:00Z','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000052','f1000000-0000-4000-8000-000000000007','section','active','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000042','f1000000-0000-4000-8000-000000000009','2026-08-17T08:00:00Z','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000053','f1000000-0000-4000-8000-000000000007','section','active','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000043','f1000000-0000-4000-8000-000000000009','2026-08-17T08:00:00Z','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO assessments(id,section_id,title,instructions,status,points_possible,available_at,due_at,created_by_person_id,metadata) VALUES
('f1000000-0000-4000-8000-000000000060','f1000000-0000-4000-8000-000000000040','Revise your personal essay','Strengthen your thesis and add evidence.','published',100,'2026-10-01T09:00:00Z','2026-10-14T23:00:00Z','f1000000-0000-4000-8000-000000000006','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000061','f1000000-0000-4000-8000-000000000041','Cell structure lab report','Explain the observations and label two diagrams.','published',100,'2026-10-01T09:00:00Z','2026-10-15T22:00:00Z','f1000000-0000-4000-8000-000000000006','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000062','f1000000-0000-4000-8000-000000000042','Quadratic functions check','Practice factoring, graphs and intercepts.','published',100,'2026-10-01T09:00:00Z','2026-10-16T22:00:00Z','f1000000-0000-4000-8000-000000000006','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000063','f1000000-0000-4000-8000-000000000043','Primary-source reflection','Respond with two observations and one question.','published',100,'2026-10-01T09:00:00Z','2026-10-15T23:00:00Z','f1000000-0000-4000-8000-000000000006','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO submissions(id,assessment_id,student_profile_id,status,timeliness,score,response,feedback,submitted_at,graded_at) VALUES
('f1000000-0000-4000-8000-000000000070','f1000000-0000-4000-8000-000000000060','f1000000-0000-4000-8000-000000000007','assigned','missing',NULL,'{}'::jsonb,'{"comment":"Strong perspective. Clarify your thesis and use one concrete example."}'::jsonb,NULL,NULL),
('f1000000-0000-4000-8000-000000000071','f1000000-0000-4000-8000-000000000061','f1000000-0000-4000-8000-000000000007','assigned','on_time',NULL,'{}'::jsonb,'{}'::jsonb,NULL,NULL),
('f1000000-0000-4000-8000-000000000072','f1000000-0000-4000-8000-000000000062','f1000000-0000-4000-8000-000000000007','graded','on_time',74,'{"text":"I reviewed quadratic functions."}'::jsonb,'{"comment":"Good on intercepts. Practice completing the square."}'::jsonb,'2026-10-14T17:00:00Z','2026-10-15T09:00:00Z'),
('f1000000-0000-4000-8000-000000000073','f1000000-0000-4000-8000-000000000063','f1000000-0000-4000-8000-000000000007','submitted','on_time',NULL,'{"text":"My primary source observations."}'::jsonb,'{}'::jsonb,'2026-10-15T10:00:00Z',NULL)
ON CONFLICT(id) DO NOTHING;
INSERT INTO calendar_events(id,type,title,description,starts_at,ends_at,timezone,organization_id,site_id,program_id,source_type,source_id,created_by_person_id,metadata) VALUES
('f1000000-0000-4000-8000-000000000080','live_class','English Literature','Live session · Join classroom','2026-10-15T17:00:00Z','2026-10-15T18:00:00Z','America/Los_Angeles','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','section','f1000000-0000-4000-8000-000000000040','f1000000-0000-4000-8000-000000000006','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000081','chapel','Chapel & reflection','Main gathering space','2026-10-15T19:15:00Z','2026-10-15T20:00:00Z','America/Los_Angeles','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','site','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000006','{"synthetic":true}'::jsonb),
('f1000000-0000-4000-8000-000000000082','mentor','Mentor check-in','Learning coach','2026-10-15T21:30:00Z','2026-10-15T21:45:00Z','America/Los_Angeles','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','student_profile','f1000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000006','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
SELECT 'synthetic_student_s1_s4' AS fixture, 'f1000000-0000-4000-8000-000000000007'::text AS student_profile_id;
