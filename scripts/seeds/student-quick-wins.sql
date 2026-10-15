-- Deterministic synthetic-only quick win action fixtures.
-- Upsert by reserved IDs. Do not modify any unrelated rows.
INSERT INTO actions
  (id,type,status,priority,title,description,owner_person_id,organization_id,site_id,program_id,subject_type,subject_id,due_at,metadata)
VALUES
  ('f2000000-0000-4000-8000-000000000001','student_recovery','open','high','Revise English essay','Review teacher feedback and strengthen the thesis.','f1000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','assessment','f1000000-0000-4000-8000-000000000060','2026-10-16T23:00:00Z','{"synthetic":true,"fixture":"student-quick-wins","kind":"work","source":"English Literature"}'::jsonb),
  ('f2000000-0000-4000-8000-000000000002','student_support','open','normal','Practice quadratic functions','Ask for help with completing the square.','f1000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','assessment','f1000000-0000-4000-8000-000000000062',NULL,'{"synthetic":true,"fixture":"student-quick-wins","kind":"work","source":"Algebra II"}'::jsonb),
  ('f2000000-0000-4000-8000-000000000003','conference_follow_up','resolved','normal','Review conference notes','Reflect on the reading goals from your conference.','f1000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','student_profile','f1000000-0000-4000-8000-000000000007',NULL,'{"synthetic":true,"fixture":"student-quick-wins","kind":"review","source":"Conferences"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
