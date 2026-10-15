-- GF40 policy and assignment release fixtures. All IDs are reserved synthetic IDs.
UPDATE sections SET metadata=metadata || '{"registrationPolicy":{"capacity":8,"prerequisites":[],"addDropEndsOn":"2026-10-31","withdrawalEndsOn":"2026-12-15","meetingKey":"TUE-THU-10"}}'::jsonb
WHERE id='f4000000-0000-4000-8000-000000000005' AND metadata->>'synthetic'='true';
UPDATE sections SET metadata=metadata || '{"registrationPolicy":{"capacity":12,"prerequisites":[],"addDropEndsOn":"2026-10-31","withdrawalEndsOn":"2026-12-15"}}'::jsonb
WHERE id='f4000000-0000-4000-8000-000000000006' AND metadata->>'synthetic'='true';

INSERT INTO assessments(id,section_id,title,instructions,status,points_possible,available_at,due_at,created_by_person_id,metadata)
VALUES('f5000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000041',
'Revisit your biology hypothesis','Rewrite the hypothesis with supporting observations and explain what changed.','published',100,
'2026-10-10T16:00:00Z','2026-10-23T22:00:00Z','f1000000-0000-4000-8000-000000000006',
'{"synthetic":true,"fixture":"gf40-rules-assignments","revisionAllowed":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO submissions(id,assessment_id,student_profile_id,status,timeliness,attempt_number,response,feedback,score,graded_at,returned_at)
VALUES('f5000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001',
'f1000000-0000-4000-8000-000000000007','returned','on_time',1,
'{"text":"My original hypothesis was that more light always increases growth."}'::jsonb,
'{"comment":"Good observation. Consider other limiting factors and revise the hypothesis."}'::jsonb,
'72','2026-10-14T19:00:00Z','2026-10-15T18:00:00Z')
ON CONFLICT (id) DO NOTHING;
