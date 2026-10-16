-- CAN OS release fixture: staff experience surfaces (insights workspace, coach
-- caseload, interactive calendar, student 360, gradebook, admin console).
-- Deterministic, synthetic-only, idempotent. Depends on student-s1-s4.sql,
-- identity-demo-accounts.sql and new-experiences-v1.sql base fixtures.
WITH
insight AS (INSERT INTO insights(id,type,status,title,summary,subject_type,subject_id,organization_id,site_id,program_id,section_id,evidence,uncertainty,recommended_actions) VALUES
('f7100000-0000-4000-8000-000000000001','missing_assignment','open','Jordan missed Revise your personal essay','The assignment deadline passed without a submission. Review context before deciding whether formal intervention is needed.','student_profile','f1000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000040','[{"fact":"assigned_and_missing"}]'::jsonb,'A missing submission alone does not establish academic risk or intent.','[{"type":"academic_follow_up","title":"Review missing assignment with student","description":"Confirm the reason, coordinate with the family if appropriate, and decide whether a support Action is needed."}]'::jsonb)
ON CONFLICT(id) DO NOTHING RETURNING id),
outreach AS (INSERT INTO actions(id,type,status,priority,title,description,owner_person_id,organization_id,site_id,program_id,subject_type,subject_id,resolution_note,resolved_at,metadata) VALUES
('f7100000-0000-4000-8000-000000000010','coach_outreach','resolved','normal','Check-in call with Morgan about Jordan''s essay','Called to understand the missing English revision.','f4100000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','student_profile','f1000000-0000-4000-8000-000000000007','Family confirmed Jordan is revising; will submit this week.',now() - interval '1 day','{"synthetic":true,"outcome":"contacted"}'::jsonb)
ON CONFLICT(id) DO NOTHING RETURNING id),
personal AS (INSERT INTO calendar_events(id,type,title,description,starts_at,ends_at,timezone,organization_id,site_id,created_by_person_id,metadata) VALUES
('f7100000-0000-4000-8000-000000000020','personal','Library study block','Quiet revision time for the English essay.','2026-10-17T21:00:00Z','2026-10-17T22:00:00Z','America/Los_Angeles','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000005','{"synthetic":true}'::jsonb)
ON CONFLICT(id) DO NOTHING RETURNING id),
personal_participant AS (INSERT INTO calendar_event_participants(id,calendar_event_id,participant_type,participant_id,role,response_status) VALUES
('f7100000-0000-4000-8000-000000000021','f7100000-0000-4000-8000-000000000020','person','f1000000-0000-4000-8000-000000000005','owner','accepted')
ON CONFLICT(id) DO NOTHING RETURNING id)
SELECT 'staff-experiences-v1 seeded' AS result;
