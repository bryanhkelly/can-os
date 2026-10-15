-- GF1 v2: deterministic, synthetic-only assignment with rubric and a graded attempt.
INSERT INTO assessments
(id,section_id,title,instructions,status,points_possible,available_at,due_at,created_by_person_id,metadata)
VALUES
('f6000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000040',
'Compare two primary sources','Compare the arguments and use one quotation from each source.','published',100,
'2026-10-12T16:00:00Z','2026-10-29T22:00:00Z','f1000000-0000-4000-8000-000000000006',
'{"synthetic":true,"fixture":"gf1-v2","rubric":"Thesis: 30 points; evidence: 40 points; clarity: 30 points"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO submissions
(id,assessment_id,student_profile_id,status,timeliness,attempt_number,response,feedback)
VALUES
('f6000000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000001',
'f1000000-0000-4000-8000-000000000007','assigned','on_time',1,'{}'::jsonb,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
