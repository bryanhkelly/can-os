-- GF41 deterministic synthetic support personnel and referral lifecycle scenarios
INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata) VALUES
('f4100000-0000-4000-8000-000000000001','Alex','Coach','Alex','{"synthetic":true,"role":"academic_coach"}'),
('f4100000-0000-4000-8000-000000000002','Robin','Learning','Robin','{"synthetic":true,"role":"learning_specialist"}'),
('f4100000-0000-4000-8000-000000000003','Casey','Counselor','Casey','{"synthetic":true,"role":"school_counselor"}'),
('f4100000-0000-4000-8000-000000000004','Jamie','Advisor','Jamie','{"synthetic":true,"role":"college_career_advisor"}')
ON CONFLICT(id) DO NOTHING;
INSERT INTO actions(id,type,status,priority,title,description,owner_person_id,organization_id,site_id,program_id,subject_type,subject_id,metadata)
VALUES
('f4100000-0000-4000-8000-000000000011','support_referral','open','normal','Student support · academic','Difficulty organizing writing assignments',NULL,
'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','student_profile','f1000000-0000-4000-8000-000000000007',
'{"synthetic":true,"fixture":"gf41","stage":"submitted","category":"academic","requestedArea":"academic","source":"teacher","notes":"Repeated difficulty forming a thesis","history":[]}'::jsonb),
('f4100000-0000-4000-8000-000000000012','support_referral','in_progress','high','Student support · learning','Request for targeted learning strategy','f4100000-0000-4000-8000-000000000002',
'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','student_profile','f1000000-0000-4000-8000-000000000007',
'{"synthetic":true,"fixture":"gf41","stage":"accepted","category":"learning","requestedArea":"learning","source":"teacher","notes":"Needs additional practice","history":[]}'::jsonb),
('f4100000-0000-4000-8000-000000000013','support_referral','in_progress','normal','Student support · planning','Review course and career interests','f4100000-0000-4000-8000-000000000004',
'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004','student_profile','f1000000-0000-4000-8000-000000000007',
'{"synthetic":true,"fixture":"gf41","stage":"review","category":"planning","requestedArea":"planning","source":"guardian","notes":"Explore course pathways","academicRecommendation":"Discuss elective options with advisor","history":[]}'::jsonb)
ON CONFLICT(id) DO NOTHING;