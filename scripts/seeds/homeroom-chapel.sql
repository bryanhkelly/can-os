-- CAN OS release fixture: deterministic, synthetic-only, idempotent.
-- Daily homeroom (25 minutes, Mon–Fri 07:30–07:55) and weekly chapel
-- (Wednesday 15:30–16:15) for the synthetic 2026–2027 school year.
--
-- Owns: homeroom course template fc…01/version fc…02, homeroom schedule
-- template fc…03 with its Mon–Fri homeroom periods, chapel schedule template
-- fc…04 with its Wednesday chapel period, homeroom section fc…05 and
-- Jordan's homeroom enrollment fc…06. The Fall instructional-day block reuses
-- the exact md5 ids owned by class-schedule-times.sql so either seed may run
-- first without duplicating calendar days.
--
-- Homeroom is a roster Section (type 'homeroom' periods project onto
-- calendars and attendance like instruction); chapel is a site-wide gathering
-- projected from the schedule template without any section binding. Times
-- avoid every slot used by class-schedule-times.sql (instruction 08:00–15:20,
-- Tue/Thu seminar 15:30, Mon/Wed 16:30 electives).
INSERT INTO course_templates(id,owning_organization_id,code,title,subject,metadata) VALUES
('fc000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','HR-S','Homeroom','Advisory','{"synthetic":true,"nonCredit":true,"fixture":"homeroom-chapel"}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO course_template_versions(id,course_template_id,version,status) VALUES
('fc000000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000001',1,'published')
ON CONFLICT(id) DO NOTHING;

INSERT INTO schedule_templates(id,school_year_id,program_id,site_id,name,active,effective_from,effective_through,metadata) VALUES
('fc000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Daily Homeroom · 07:30',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"homeroom-chapel"}'::jsonb),
('fc000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','Weekly Chapel · Wednesday',true,'2026-08-17','2027-06-04','{"synthetic":true,"fixture":"homeroom-chapel"}'::jsonb)
ON CONFLICT(id) DO NOTHING;

-- 25-minute homeroom every school-day morning.
INSERT INTO schedule_template_periods(id,schedule_template_id,day_of_week,sequence,label,starts_at_local,ends_at_local,type,metadata)
SELECT md5('homeroom-chapel-period:homeroom:'||dow)::uuid,'fc000000-0000-4000-8000-000000000003',dow,1,
 'Homeroom','07:30'::time,'07:55'::time,'homeroom','{"synthetic":true,"fixture":"homeroom-chapel"}'::jsonb
FROM generate_series(1,5) AS dow
ON CONFLICT(id) DO NOTHING;

-- Weekly all-school chapel on Wednesday afternoons.
INSERT INTO schedule_template_periods(id,schedule_template_id,day_of_week,sequence,label,starts_at_local,ends_at_local,type,metadata) VALUES
(md5('homeroom-chapel-period:chapel:3')::uuid,'fc000000-0000-4000-8000-000000000004',3,1,
 'Chapel','15:30'::time,'16:15'::time,'chapel','{"synthetic":true,"fixture":"homeroom-chapel"}'::jsonb)
ON CONFLICT(id) DO NOTHING;

INSERT INTO sections(id,program_id,site_id,course_template_version_id,code,title,term_id,schedule_template_id,active,metadata) VALUES
('fc000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000002','HR-S','Homeroom','f1000000-0000-4000-8000-000000000010','fc000000-0000-4000-8000-000000000003',true,'{"synthetic":true,"nonCredit":true,"fixture":"homeroom-chapel"}'::jsonb)
ON CONFLICT(id) DO NOTHING;

-- Riley Example leads the synthetic homeroom.
INSERT INTO section_teachers(section_id,person_id,role)
VALUES ('fc000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000006','teacher')
ON CONFLICT(section_id,person_id) DO NOTHING;

-- Jordan Example attends homeroom daily.
INSERT INTO enrollments(id,student_profile_id,kind,status,organization_id,program_id,section_id,school_year_id,started_at,metadata) VALUES
('fc000000-0000-4000-8000-000000000006','f1000000-0000-4000-8000-000000000007','section','active','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004','fc000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000009','2026-08-17T08:00:00Z','{"synthetic":true,"fixture":"homeroom-chapel"}'::jsonb)
ON CONFLICT(id) DO NOTHING;

-- Fall-term instructional weekdays, shared id-for-id with class-schedule-times.sql
-- so projection works regardless of seed order. Operator-entered days win.
INSERT INTO academic_calendar_days(id,academic_calendar_id,calendar_date,type,instructional_minutes,metadata)
SELECT md5('class-schedule-day:'||d::date)::uuid,'f1000000-0000-4000-8000-000000000011',d::date,'instructional',330,
 '{"synthetic":true,"fixture":"class-schedule-times"}'::jsonb
FROM generate_series('2026-08-17'::date,'2026-12-18'::date,'1 day') AS d
WHERE extract(isodow FROM d) <= 5
ON CONFLICT(academic_calendar_id,calendar_date) DO NOTHING;
