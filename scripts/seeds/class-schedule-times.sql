-- CAN OS release fixture: deterministic, synthetic-only, idempotent.
-- Weekday class meeting times for the synthetic 2026–2027 school year so
-- student and teacher calendars project recurring class times.
--
-- Owns: schedule templates f8000000-…-01..10, their instruction periods, and
-- the Fall-term instructional days on academic calendar f1000000-…-11.
-- Section wiring here covers only the base-seed sections (student-s1-s4.sql);
-- later seeds wire their own sections to these shared templates
-- (valor-curriculum-marketplace.sql, gf40-course-registration.sql).
--
-- The timetable keeps every section of the shared synthetic student and
-- teacher non-overlapping, and leaves Monday 15:30+ free for the operator
-- -created Close Reading seminar in development databases.
INSERT INTO schedule_templates(id,school_year_id,program_id,site_id,name,active,effective_from,effective_through,metadata) VALUES
('f8000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Weekday Period 1 · 08:00',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb),
('f8000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Weekday Period 2 · 09:00',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb),
('f8000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Weekday Period 3 · 10:00',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb),
('f8000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Weekday Period 4 · 11:00',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb),
('f8000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Weekday Period 5 · 12:30',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb),
('f8000000-0000-4000-8000-000000000006','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Weekday Period 6 · 13:30',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb),
('f8000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Weekday Period 7 · 14:30',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb),
('f8000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Tue/Thu Seminar · 15:30',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb),
('f8000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Mon/Wed Elective · 16:30',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb),
('f8000000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Tue/Thu Elective · 16:30',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb)
ON CONFLICT(id) DO NOTHING;

-- Daily Mon–Fri instruction periods for the seven core slots.
WITH daily(template_id,label,starts,ends) AS (VALUES
 ('f8000000-0000-4000-8000-000000000001','Period 1','08:00','08:50'),
 ('f8000000-0000-4000-8000-000000000002','Period 2','09:00','09:50'),
 ('f8000000-0000-4000-8000-000000000003','Period 3','10:00','10:50'),
 ('f8000000-0000-4000-8000-000000000004','Period 4','11:00','11:50'),
 ('f8000000-0000-4000-8000-000000000005','Period 5','12:30','13:20'),
 ('f8000000-0000-4000-8000-000000000006','Period 6','13:30','14:20'),
 ('f8000000-0000-4000-8000-000000000007','Period 7','14:30','15:20')
)
INSERT INTO schedule_template_periods(id,schedule_template_id,day_of_week,sequence,label,starts_at_local,ends_at_local,type,metadata)
SELECT md5('class-schedule-period:'||daily.template_id||':'||dow)::uuid,daily.template_id::uuid,dow,1,
 daily.label,daily.starts::time,daily.ends::time,'instruction','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb
FROM daily CROSS JOIN generate_series(1,5) AS dow
ON CONFLICT(id) DO NOTHING;

-- Twice-weekly seminar and elective slots.
WITH twice(template_id,dow,label,starts,ends) AS (VALUES
 ('f8000000-0000-4000-8000-000000000008',2,'Seminar','15:30','16:20'),
 ('f8000000-0000-4000-8000-000000000008',4,'Seminar','15:30','16:20'),
 ('f8000000-0000-4000-8000-000000000009',1,'Elective','16:30','17:20'),
 ('f8000000-0000-4000-8000-000000000009',3,'Elective','16:30','17:20'),
 ('f8000000-0000-4000-8000-000000000010',2,'Elective','16:30','17:20'),
 ('f8000000-0000-4000-8000-000000000010',4,'Elective','16:30','17:20')
)
INSERT INTO schedule_template_periods(id,schedule_template_id,day_of_week,sequence,label,starts_at_local,ends_at_local,type,metadata)
SELECT md5('class-schedule-period:'||twice.template_id||':'||twice.dow)::uuid,twice.template_id::uuid,twice.dow,1,
 twice.label,twice.starts::time,twice.ends::time,'instruction','{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb
FROM twice
ON CONFLICT(id) DO NOTHING;

-- Fall-term instructional weekdays on the active synthetic site calendar.
-- Existing operator-entered days win the conflict and are preserved.
INSERT INTO academic_calendar_days(id,academic_calendar_id,calendar_date,type,instructional_minutes,metadata)
SELECT md5('class-schedule-day:'||d::date)::uuid,'f1000000-0000-4000-8000-000000000011',d::date,'instructional',330,
 '{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb
FROM generate_series('2026-08-17'::date,'2026-12-18'::date,'1 day') AS d
WHERE extract(isodow FROM d) <= 5
ON CONFLICT(academic_calendar_id,calendar_date) DO NOTHING;

-- Meeting times for the base-seed sections. Operator-assigned schedules are
-- never overwritten.
UPDATE sections SET schedule_template_id='f8000000-0000-4000-8000-000000000008'
 WHERE id='f1000000-0000-4000-8000-000000000040' AND schedule_template_id IS NULL; -- ENG-S
UPDATE sections SET schedule_template_id='f8000000-0000-4000-8000-000000000006'
 WHERE id='f1000000-0000-4000-8000-000000000041' AND schedule_template_id IS NULL; -- BIO-S
UPDATE sections SET schedule_template_id='f8000000-0000-4000-8000-000000000005'
 WHERE id='f1000000-0000-4000-8000-000000000042' AND schedule_template_id IS NULL; -- ALG-S
UPDATE sections SET schedule_template_id='f8000000-0000-4000-8000-000000000007'
 WHERE id='f1000000-0000-4000-8000-000000000043' AND schedule_template_id IS NULL; -- HIS-S
