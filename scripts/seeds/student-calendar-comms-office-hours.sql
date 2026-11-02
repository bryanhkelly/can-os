
INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata)
VALUES('f3000000-0000-4000-8000-000000000007','Morgan','Example','Morgan','{"synthetic":true,"fixture":"student-calendar-comms-office-hours","role":"guardian"}'::jsonb)
ON CONFLICT(id) DO NOTHING;

-- can_manage_enrollment plus verified metadata let Morgan execute the
-- manifest's declared /guardian/admission-offers interactions; unverified
-- relationships stay locked out of enrollment management.
INSERT INTO guardian_relationships(id,guardian_person_id,student_person_id,relationship_label,can_view_academics,can_manage_enrollment,metadata)
VALUES('f3000000-0000-4000-8000-000000000008','f3000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000005','parent',true,true,
'{"synthetic":true,"fixture":"student-calendar-comms-office-hours","verification":"verified"}'::jsonb)
ON CONFLICT(id) DO NOTHING;
-- Fully synthetic release fixtures. Idempotent and isolated by fixed IDs.
INSERT INTO notifications(id,recipient_person_id,type,status,title,body,resource_type,resource_id)
VALUES
('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000005','synthetic_site_announcement','unread','Friday learning studio change','The local campus learning studio will meet in Room 3 on Friday.','site','f1000000-0000-4000-8000-000000000003'),
('f3000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000005','synthetic_network_announcement','unread','CAN reading challenge','Choose a book and bring one discussion question.','program','f1000000-0000-4000-8000-000000000004')
ON CONFLICT(id) DO NOTHING;

INSERT INTO conference_series(id,site_id,teacher_person_id,title,starts_at,ends_at,slot_minutes,status,metadata)
VALUES('f3000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000006','Synthetic teacher office hours','2026-10-22T21:00:00Z','2026-10-22T22:00:00Z',20,'published','{"synthetic":true,"fixture":"student-calendar-comms-office-hours"}'::jsonb)
ON CONFLICT(id) DO NOTHING;

INSERT INTO conference_slots(id,conference_series_id,starts_at,ends_at,status)
VALUES
('f3000000-0000-4000-8000-000000000004','f3000000-0000-4000-8000-000000000003','2026-10-22T21:00:00Z','2026-10-22T21:20:00Z','available'),
('f3000000-0000-4000-8000-000000000005','f3000000-0000-4000-8000-000000000003','2026-10-22T21:20:00Z','2026-10-22T21:40:00Z','available'),
('f3000000-0000-4000-8000-000000000006','f3000000-0000-4000-8000-000000000003','2026-10-22T21:40:00Z','2026-10-22T22:00:00Z','available')
ON CONFLICT(id) DO NOTHING;
