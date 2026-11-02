-- CAN OS release fixture: new experience surfaces (family home, teacher today,
-- attendance loop, messaging, report cards, program launch).
-- Deterministic, synthetic-only, idempotent. Apply only to isolated synthetic data.
-- Depends on student-s1-s4.sql + identity-demo-accounts.sql base fixture
-- (org ...0002, site ...0003, program ...0004, term ...0010, Jordan/Riley).
-- Sequential INSERT statements (not a single WITH chain): FK checks cannot see
-- sibling CTE inserts from the same statement.
-- Morgan Example (guardian persona for the attendance/messaging/Needs You rows
-- below) is declared here so this route seed is standalone when applied on the
-- base fixture; student-calendar-comms-office-hours.sql and
-- public-family-admissions-v1.sql insert the same person idempotently.
INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata) VALUES
('f7000000-0000-4000-8000-000000000001','Alex','Example','Alex','{"synthetic":true,"role":"registrar"}'::jsonb),
('f3000000-0000-4000-8000-000000000007','Morgan','Example','Morgan','{"synthetic":true,"role":"guardian"}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO access_accounts (id,email_normalized) VALUES
('f7000000-0000-4000-8000-000000000002','alex.registrar@valorschool.demo')
ON CONFLICT (id) DO NOTHING;
INSERT INTO account_person_grants(id,account_id,person_id,role,organization_id,site_id) VALUES
('f7000000-0000-4000-8000-000000000003','f7000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000001','registrar','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;
-- Report cards: one grading period on the synthetic Fall term.
INSERT INTO grading_periods(id,term_id,key,name,sequence,starts_on,ends_on,grade_posting_opens_at,grade_posting_closes_at) VALUES
('f7000000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000010','q1','Quarter 1',1,'2026-08-17','2026-10-09','2026-10-10T00:00:00Z','2026-10-20T23:59:59Z')
ON CONFLICT(id) DO NOTHING;
INSERT INTO section_grades(id,section_id,student_profile_id,grading_period_id,term_id,status,percentage,letter_grade,grade_scale_id,finalized_by_person_id,finalized_at,metadata) VALUES
('f7000000-0000-4000-8000-000000000011','f1000000-0000-4000-8000-000000000040','f1000000-0000-4000-8000-000000000007','f7000000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000010','finalized',91.50,'A','f1000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000006','2026-10-12T18:00:00Z','{"synthetic":true}'::jsonb),
('f7000000-0000-4000-8000-000000000012','f1000000-0000-4000-8000-000000000041','f1000000-0000-4000-8000-000000000007','f7000000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000010','finalized',84.00,'B','f1000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000006','2026-10-12T18:00:00Z','{"synthetic":true}'::jsonb),
('f7000000-0000-4000-8000-000000000013','f1000000-0000-4000-8000-000000000042','f1000000-0000-4000-8000-000000000007','f7000000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000010','finalized',76.25,'C','f1000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000006','2026-10-12T18:00:00Z','{"synthetic":true}'::jsonb),
('f7000000-0000-4000-8000-000000000014','f1000000-0000-4000-8000-000000000043','f1000000-0000-4000-8000-000000000007','f7000000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000010','finalized',88.75,'B','f1000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000006','2026-10-12T18:00:00Z','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
-- Attendance: one excused-pending absence (staff review queue) and one with no
-- excuse (guardian excuse form + Family Home unexcused count + Needs You).
INSERT INTO attendance_events(id,student_profile_id,program_id,site_id,occurrence_key,status,expected_at,recorded_by_person_id,source_key,metadata) VALUES
('f7000000-0000-4000-8000-000000000020','f1000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','2026-10-13:site-day','absent','2026-10-13T15:00:00Z','f1000000-0000-4000-8000-000000000006','seed:attendance:f7000020','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO attendance_events(id,student_profile_id,program_id,site_id,occurrence_key,status,expected_at,recorded_by_person_id,source_key,metadata) VALUES
('f7000000-0000-4000-8000-000000000021','f1000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','2026-10-15:site-day','absent','2026-10-15T15:00:00Z','f1000000-0000-4000-8000-000000000006','seed:attendance:f7000021','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO attendance_excuses(id,attendance_event_id,submitted_by_person_id,status,reason,document_ids) VALUES
('f7000000-0000-4000-8000-000000000022','f7000000-0000-4000-8000-000000000020','f3000000-0000-4000-8000-000000000007','submitted','Jordan had a dentist appointment; note attached to family file.','[]'::jsonb)
ON CONFLICT(id) DO NOTHING;
-- Messaging: one contextual thread with all three day-to-day personas.
INSERT INTO communication_threads(id,subject,context_type,context_id,created_by_person_id,last_message_at,metadata) VALUES
('f7000000-0000-4000-8000-000000000030','Jordan · Revise your personal essay','submission',null,'f1000000-0000-4000-8000-000000000006',now(),'{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO communication_participants(id,thread_id,participant_type,participant_id) VALUES
('f7000000-0000-4000-8000-000000000031','f7000000-0000-4000-8000-000000000030','person','f1000000-0000-4000-8000-000000000005'),
('f7000000-0000-4000-8000-000000000032','f7000000-0000-4000-8000-000000000030','person','f1000000-0000-4000-8000-000000000006'),
('f7000000-0000-4000-8000-000000000033','f7000000-0000-4000-8000-000000000030','person','f3000000-0000-4000-8000-000000000007')
ON CONFLICT(id) DO NOTHING;
INSERT INTO communication_messages(id,thread_id,sender_person_id,body,sent_at,metadata) VALUES
('f7000000-0000-4000-8000-000000000034','f7000000-0000-4000-8000-000000000030','f1000000-0000-4000-8000-000000000006','Jordan, your essay revision is past due. What is your plan to get it in this week?',now() - interval '1 day','{"synthetic":true}'::jsonb),
('f7000000-0000-4000-8000-000000000035','f7000000-0000-4000-8000-000000000030','f3000000-0000-4000-8000-000000000007','Thanks Riley — we reviewed the feedback together and Jordan will submit tomorrow evening.',now() - interval '20 hours','{"synthetic":true}'::jsonb),
('f7000000-0000-4000-8000-000000000036','f7000000-0000-4000-8000-000000000030','f1000000-0000-4000-8000-000000000005','Draft is done, just adding the citations. Submitting tomorrow.',now() - interval '2 hours','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
-- Needs You: one guardian-owned action + one unread guardian notification.
INSERT INTO actions(id,type,status,priority,title,description,owner_person_id,organization_id,site_id,program_id,subject_type,subject_id,due_at,metadata) VALUES
('f7000000-0000-4000-8000-000000000040','enrollment_document','open','high','Sign Jordan''s enrollment consent form','The 2026–2027 enrollment packet needs a guardian signature before sections can be confirmed.','f3000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','student_profile','f1000000-0000-4000-8000-000000000007',now() + interval '5 days','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO notifications(id,recipient_person_id,type,status,title,body,resource_type,resource_id) VALUES
('f7000000-0000-4000-8000-000000000041','f3000000-0000-4000-8000-000000000007','missing_assignment','unread','Revise your personal essay is missing','Jordan has a missing assignment that may need follow-up.','submission',null)
ON CONFLICT(id) DO NOTHING;
-- Program launch: definition + one in-progress launch so the wizard shows both panels.
INSERT INTO journey_definitions(id,key,version,owning_organization_id,audience,title,active,configuration) VALUES
('f7000000-0000-4000-8000-000000000050','program-launch','1','f1000000-0000-4000-8000-000000000002','operations','Program Launch',true,'{"requirements":[{"key":"staffing","title":"Required staff and role assignments complete","blocking":true,"owner":"partner"},{"key":"facility","title":"Facility and onsite readiness verified","blocking":true,"owner":"partner"},{"key":"teacher-readiness","title":"Teacher readiness and section provisioning complete","blocking":true,"owner":"can"},{"key":"orientation","title":"Orientation and calendar events scheduled","blocking":false,"owner":"partner"}]}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO programs(id,organization_id,site_id,jurisdiction_id,type,status,name,slug,grade_range,delivery_model,host_organization_id,academic_provider_organization_id,credit_issuing_organization_id,metadata) VALUES
('f7000000-0000-4000-8000-000000000051','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','microschool','launching','Synthetic Microschool Pilot','synthetic-microschool','{"min":"6","max":"8"}'::jsonb,'{"onsite":true,"asynchronous":true}'::jsonb,'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO journeys(id,type,status,participant_type,participant_id,organization_id,site_id,program_id,owner_person_id,journey_definition_id,definition_version,started_at,metadata) VALUES
('f7000000-0000-4000-8000-000000000052','program-launch','in_progress','program','f7000000-0000-4000-8000-000000000051','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f7000000-0000-4000-8000-000000000051','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000050','1',now() - interval '3 days','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO journey_requirements(id,journey_id,key,title,status,blocking,completed_at) VALUES
('f7000000-0000-4000-8000-000000000053','f7000000-0000-4000-8000-000000000052','staffing','Required staff and role assignments complete','complete',true,now() - interval '1 day'),
('f7000000-0000-4000-8000-000000000054','f7000000-0000-4000-8000-000000000052','facility','Facility and onsite readiness verified','needs_you',true,null),
('f7000000-0000-4000-8000-000000000055','f7000000-0000-4000-8000-000000000052','teacher-readiness','Teacher readiness and section provisioning complete','needs_can',true,null),
('f7000000-0000-4000-8000-000000000056','f7000000-0000-4000-8000-000000000052','orientation','Orientation and calendar events scheduled','needs_you',false,null)
ON CONFLICT(id) DO NOTHING;
SELECT 'new-experiences-v1 seeded' AS result;
