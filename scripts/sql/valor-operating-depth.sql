-- Valor School operating-depth data. Idempotent; safe to re-apply.
-- Gives the Valor demo tenant the roster, schedule, grade history, website
-- content, enrichment and admissions depth of an operating school.
-- All data belongs to the .demo Valor tenant and is synthetic by tenancy;
-- no per-row provenance flags are used. No launching Programs are created.
-- Deterministic IDs use the fd7* prefix or md5-derived UUIDs.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Naming sweep: remove "Synthetic"/placeholder names from operating records.
-- ---------------------------------------------------------------------------
UPDATE school_years SET name='2026–2027'
 WHERE id='f1000000-0000-4000-8000-000000000009' AND name='2026–2027 Synthetic';
UPDATE school_years SET name='2027–2028 (planning)'
 WHERE organization_id='f1000000-0000-4000-8000-000000000002' AND name='UX check 2027–2028';
UPDATE grade_scales SET name='Valor Standard'
 WHERE id='f1000000-0000-4000-8000-000000000008' AND name='Synthetic Standard';
UPDATE academic_calendars SET name='Valor Academic Calendar'
 WHERE id='f1000000-0000-4000-8000-000000000011' AND name='Synthetic Site Calendar';

-- ---------------------------------------------------------------------------
-- 2. Site identity: a complete, well-formed campus address (fictional street).
-- ---------------------------------------------------------------------------
UPDATE sites SET address='{"street1":"1420 Alder Grove Lane","city":"San Rafael","state":"CA","postalCode":"94901","county":"Marin","country":"US"}'::jsonb
 WHERE id='f1000000-0000-4000-8000-000000000003' AND address IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Teaching staff: five additional teachers; Riley keeps the base-fixture
--    sections required by the demo account workflows (ENG-S, BIO-S, ALG-S,
--    HIS-S and CAN-ALG1) and hands the rest to the new staff.
-- ---------------------------------------------------------------------------
-- Alex (registrar persona) authors operational records below; declared
-- idempotently with the same identity as the base fixtures.
INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata) VALUES
('f7000000-0000-4000-8000-000000000001','Alex','Example','Alex','{"synthetic":true,"role":"registrar"}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata) VALUES
('fd7a0000-0000-4000-8000-000000000001','Elena','Vasquez','Elena','{"role":"teacher","subject":"Science"}'::jsonb),
('fd7a0000-0000-4000-8000-000000000002','Marcus','Webb','Marcus','{"role":"teacher","subject":"Mathematics"}'::jsonb),
('fd7a0000-0000-4000-8000-000000000003','Sarah','Chen','Sarah','{"role":"teacher","subject":"English"}'::jsonb),
('fd7a0000-0000-4000-8000-000000000004','David','Okafor','David','{"role":"teacher","subject":"History"}'::jsonb),
('fd7a0000-0000-4000-8000-000000000005','Maria','Flores','Maria','{"role":"teacher","subject":"World Languages & Arts"}'::jsonb)
ON CONFLICT(id) DO NOTHING;

DELETE FROM section_teachers st USING sections s
 WHERE st.section_id=s.id AND s.site_id='f1000000-0000-4000-8000-000000000003'
   AND st.person_id='f1000000-0000-4000-8000-000000000006'
   AND s.code IN ('CAN-ENG9','CAN-BIO','CAN-USHIST','HR-S','ENG-CR-01');

INSERT INTO section_teachers(section_id,person_id,role,assignment_source)
SELECT s.id, x.person_id::uuid, 'teacher', 'manual'
FROM (VALUES
 ('CAN-BIO','fd7a0000-0000-4000-8000-000000000001'),
 ('CAN-ALG1','fd7a0000-0000-4000-8000-000000000002'),
 ('ALG-S','fd7a0000-0000-4000-8000-000000000002'),
 ('CAN-ENG9','fd7a0000-0000-4000-8000-000000000003'),
 ('ENG-CR-01','fd7a0000-0000-4000-8000-000000000003'),
 ('CAN-USHIST','fd7a0000-0000-4000-8000-000000000004'),
 ('HR-S','fd7a0000-0000-4000-8000-000000000004'),
 ('SPAN-S','fd7a0000-0000-4000-8000-000000000005'),
 ('PHOTO-S','fd7a0000-0000-4000-8000-000000000005')
) AS x(code,person_id)
JOIN sections s ON s.code=x.code AND s.site_id='f1000000-0000-4000-8000-000000000003'
ON CONFLICT (section_id,person_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Students (grades 9 and 10) with guardians and relationships.
-- ---------------------------------------------------------------------------
INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata)
SELECT ('fd7b0000-0000-4000-8000-0000000000'||lpad(i::text,2,'0'))::uuid, f, l, f, '{}'::jsonb
FROM (VALUES
 (1,'Ava','Martinez'),(2,'Mateo','Martinez'),(3,'Sofia','Nguyen'),(4,'Ethan','Brooks'),
 (5,'Maya','Patel'),(6,'Noah','Williams'),(7,'Isabella','Torres'),(8,'Caleb','Foster'),
 (9,'Grace','Lee'),(10,'Diego','Ramirez'),(11,'Olivia','Carter'),(12,'Ben','Carter'),
 (13,'Emma','Thompson'),(14,'Lucas','Kim'),(15,'Chloe','Anderson'),(16,'Isaiah','Brown'),
 (17,'Lily','Hernandez'),(18,'Owen','Mitchell'),(19,'Zoe','Clark'),(20,'Evan','Clark')
) AS v(i,f,l)
ON CONFLICT(id) DO NOTHING;

INSERT INTO student_profiles(id,person_id,student_number,grade_level,metadata)
SELECT ('fd7c0000-0000-4000-8000-0000000000'||lpad(i::text,2,'0'))::uuid,
       ('fd7b0000-0000-4000-8000-0000000000'||lpad(i::text,2,'0'))::uuid,
       'V26-1'||lpad(i::text,2,'0'),
       CASE WHEN i<=10 THEN '9' ELSE '10' END, '{}'::jsonb
FROM generate_series(1,20) AS g(i)
ON CONFLICT(id) DO NOTHING;

INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata)
SELECT ('fd7d0000-0000-4000-8000-0000000000'||lpad(i::text,2,'0'))::uuid, f, l, f, '{"role":"guardian"}'::jsonb
FROM (VALUES
 (1,'Carmen','Martinez'),(2,'Thanh','Nguyen'),(3,'Dana','Brooks'),(4,'Anil','Patel'),
 (5,'Keisha','Williams'),(6,'Luis','Torres'),(7,'Megan','Foster'),(8,'Daniel','Lee'),
 (9,'Elena','Ramirez'),(10,'James','Carter'),(11,'Claire','Thompson'),(12,'Jin','Kim'),
 (13,'Scott','Anderson'),(14,'Tasha','Brown'),(15,'Rosa','Hernandez'),(16,'Paul','Mitchell'),
 (17,'Rachel','Clark')
) AS v(i,f,l)
ON CONFLICT(id) DO NOTHING;

INSERT INTO guardian_relationships
(id,guardian_person_id,student_person_id,relationship_label,can_view_academics,can_manage_enrollment,can_submit_attendance_excuse,metadata)
SELECT md5('valor-depth-gr:'||g||':'||s)::uuid,
       ('fd7d0000-0000-4000-8000-0000000000'||lpad(g::text,2,'0'))::uuid,
       ('fd7b0000-0000-4000-8000-0000000000'||lpad(s::text,2,'0'))::uuid,
       'parent', true, true, true, '{"verification":"verified"}'::jsonb
FROM (VALUES
 (1,1),(1,2),(2,3),(3,4),(4,5),(5,6),(6,7),(7,8),(8,9),(9,10),
 (10,11),(10,12),(11,13),(12,14),(13,15),(14,16),(15,17),(16,18),(17,19),(17,20)
) AS v(g,s)
ON CONFLICT(id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Enrollments: a program enrollment per student plus grade-level schedules.
--    Grade 9: CAN-ENG9, CAN-ALG1, CAN-BIO, CAN-USHIST; grade 10: ENG-S, ALG-S,
--    BIO-S, HIS-S; everyone takes Homeroom plus one alternating elective.
-- ---------------------------------------------------------------------------
INSERT INTO enrollments(id,student_profile_id,kind,status,organization_id,program_id,school_year_id,started_at,metadata)
SELECT md5('valor-depth-prog-enr:'||i)::uuid,
       ('fd7c0000-0000-4000-8000-0000000000'||lpad(i::text,2,'0'))::uuid,
       'program','active','f1000000-0000-4000-8000-000000000002',
       'f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000009',
       '2026-08-17T15:00:00Z','{}'::jsonb
FROM generate_series(1,20) AS g(i)
ON CONFLICT(id) DO NOTHING;

INSERT INTO enrollments(id,student_profile_id,kind,status,organization_id,program_id,section_id,school_year_id,started_at,metadata)
SELECT md5('valor-depth-enr:'||i||':'||s.code)::uuid,
       ('fd7c0000-0000-4000-8000-0000000000'||lpad(i::text,2,'0'))::uuid,
       'section','active','f1000000-0000-4000-8000-000000000002',
       'f1000000-0000-4000-8000-000000000004', s.id,
       'f1000000-0000-4000-8000-000000000009','2026-08-17T15:00:00Z','{}'::jsonb
FROM generate_series(1,20) AS g(i)
JOIN sections s ON s.site_id='f1000000-0000-4000-8000-000000000003' AND (
  (i<=10 AND s.code IN ('CAN-ENG9','CAN-ALG1','CAN-BIO','CAN-USHIST')) OR
  (i>10 AND s.code IN ('ENG-S','ALG-S','BIO-S','HIS-S')) OR
  s.code='HR-S' OR
  (i%2=1 AND s.code='SPAN-S') OR (i%2=0 AND s.code='PHOTO-S'))
ON CONFLICT(id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Assessment streams per academic section (Homeroom excluded) and graded
--    history for every enrolled student. The final assignment is upcoming.
-- ---------------------------------------------------------------------------
INSERT INTO assessments(id,section_id,title,instructions,status,points_possible,available_at,due_at,created_by_person_id,metadata)
SELECT md5('valor-depth-assess:'||s.code||':'||a.n)::uuid, s.id,
       s.title||' — '||a.label,
       'Complete and submit through your class workspace. Ask your teacher early if anything is unclear.',
       'published', a.points,
       (a.due::timestamptz - interval '14 days'), a.due::timestamptz,
       COALESCE((SELECT st.person_id FROM section_teachers st WHERE st.section_id=s.id AND st.role='teacher' ORDER BY st.created_at LIMIT 1),
                'f1000000-0000-4000-8000-000000000006'),
       '{}'::jsonb
FROM sections s
CROSS JOIN (VALUES
 (1,'Unit 1 check-in quiz',20,'2026-09-11T22:00:00Z'),
 (2,'Primary source response',50,'2026-10-02T22:00:00Z'),
 (3,'Unit 2 project milestone',40,'2026-10-16T22:00:00Z'),
 (4,'Unit 2 exam',100,'2026-10-30T22:00:00Z'),
 (5,'Research draft',50,'2026-11-13T23:00:00Z')
) AS a(n,label,points,due)
WHERE s.site_id='f1000000-0000-4000-8000-000000000003' AND s.code<>'HR-S'
ON CONFLICT(id) DO NOTHING;

-- Past-due work: mostly graded, some submitted awaiting grading, some missing.
INSERT INTO submissions(id,assessment_id,student_profile_id,status,timeliness,attempt_number,submitted_at,graded_at,score,grader_person_id,response,feedback)
SELECT md5('valor-depth-sub:'||a.id||':'||e.student_profile_id)::uuid,
 a.id, e.student_profile_id,
 (CASE WHEN h%9=0 THEN 'submitted' ELSE 'graded' END)::submission_status,
 (CASE WHEN h%7=0 THEN 'late' ELSE 'on_time' END)::submission_timeliness,
 1,
 CASE WHEN h%7=0 THEN a.due_at + interval '26 hours' ELSE a.due_at - interval '3 hours' END,
 CASE WHEN h%9=0 THEN NULL ELSE a.due_at + interval '2 days' END,
 CASE WHEN h%9=0 THEN NULL ELSE round(a.points_possible*(60+(h%39))/100.0,1) END,
 CASE WHEN h%9=0 THEN NULL ELSE a.created_by_person_id END,
 '{}'::jsonb,'{}'::jsonb
FROM assessments a
JOIN sections s ON s.id=a.section_id AND s.site_id='f1000000-0000-4000-8000-000000000003'
JOIN enrollments e ON e.section_id=s.id AND e.kind='section' AND e.status='active'
CROSS JOIN LATERAL (SELECT abs(hashtext(a.id::text||e.student_profile_id::text)) AS h) AS hx
WHERE a.due_at < now()
  AND a.instructions LIKE 'Complete and submit through your class workspace%'
  AND h%11<>0
ON CONFLICT(id) DO NOTHING;

-- Upcoming work appears as assigned for every enrolled student.
INSERT INTO submissions(id,assessment_id,student_profile_id,status,timeliness,attempt_number,response,feedback)
SELECT md5('valor-depth-sub:'||a.id||':'||e.student_profile_id)::uuid,
 a.id, e.student_profile_id, 'assigned','on_time',1,'{}'::jsonb,'{}'::jsonb
FROM assessments a
JOIN sections s ON s.id=a.section_id AND s.site_id='f1000000-0000-4000-8000-000000000003'
JOIN enrollments e ON e.section_id=s.id AND e.kind='section' AND e.status='active'
WHERE a.due_at >= now()
  AND a.instructions LIKE 'Complete and submit through your class workspace%'
ON CONFLICT(id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Living calendar: recurring class meetings for the Fall term (holidays
--    skipped) plus weekly chapel. The BEFORE INSERT trigger creates the
--    canonical scheduled occurrence for each event.
-- ---------------------------------------------------------------------------
INSERT INTO calendar_events(id,type,title,starts_at,ends_at,timezone,organization_id,site_id,program_id,section_id,created_by_person_id,metadata)
SELECT md5('valor-depth-cal:'||m.code||':'||d.d)::uuid,
 'live_class', s.title,
 (d.d::text||' '||m.start_t)::timestamp AT TIME ZONE 'America/Los_Angeles',
 (d.d::text||' '||m.end_t)::timestamp AT TIME ZONE 'America/Los_Angeles',
 'America/Los_Angeles',
 'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',
 'f1000000-0000-4000-8000-000000000004', s.id,
 COALESCE((SELECT st.person_id FROM section_teachers st WHERE st.section_id=s.id AND st.role='teacher' ORDER BY st.created_at LIMIT 1),
          'f1000000-0000-4000-8000-000000000006'),
 '{}'::jsonb
FROM (VALUES
 ('HR-S',      '{1,2,3,4,5}'::int[], '08:05','08:25'),
 ('CAN-ENG9',  '{1,3,5}'::int[],     '08:30','09:25'),
 ('CAN-ALG1',  '{1,3,5}'::int[],     '09:35','10:30'),
 ('CAN-BIO',   '{1,3,5}'::int[],     '10:45','11:40'),
 ('CAN-USHIST','{1,3,5}'::int[],     '13:35','14:30'),
 ('SPAN-S',    '{1,3,5}'::int[],     '14:40','15:35'),
 ('ENG-S',     '{2,4}'::int[],       '08:30','09:25'),
 ('ALG-S',     '{2,4}'::int[],       '09:35','10:30'),
 ('BIO-S',     '{2,4}'::int[],       '10:45','11:40'),
 ('HIS-S',     '{2,4}'::int[],       '13:35','14:30'),
 ('ENG-CR-01', '{2,4}'::int[],       '12:30','13:25'),
 ('PHOTO-S',   '{2,4}'::int[],       '14:40','15:35')
) AS m(code,dows,start_t,end_t)
JOIN sections s ON s.code=m.code AND s.site_id='f1000000-0000-4000-8000-000000000003'
JOIN LATERAL (
  SELECT d::date FROM generate_series(date '2026-08-17', date '2026-12-18', interval '1 day') AS gs(d)
  WHERE extract(isodow FROM d) = ANY(m.dows)
    AND d::date NOT IN ('2026-09-07','2026-11-11')
    AND d::date NOT BETWEEN '2026-11-23' AND '2026-11-27'
) AS d ON true
ON CONFLICT(id) DO NOTHING;

INSERT INTO calendar_events(id,type,title,starts_at,ends_at,timezone,organization_id,site_id,program_id,created_by_person_id,metadata)
SELECT md5('valor-depth-chapel:'||d.d)::uuid,
 'chapel','Chapel & reflection',
 (d.d::text||' 12:00')::timestamp AT TIME ZONE 'America/Los_Angeles',
 (d.d::text||' 12:25')::timestamp AT TIME ZONE 'America/Los_Angeles',
 'America/Los_Angeles',
 'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',
 'f1000000-0000-4000-8000-000000000004','f7000000-0000-4000-8000-000000000001','{}'::jsonb
FROM (
  SELECT d::date FROM generate_series(date '2026-08-19', date '2026-12-16', interval '1 day') AS gs(d)
  WHERE extract(isodow FROM d)=3 AND d::date NOT BETWEEN '2026-11-23' AND '2026-11-27'
) AS d
ON CONFLICT(id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Published website story through the canonical local-content model.
--    Plain text only; no protected institutional or admissions claims.
-- ---------------------------------------------------------------------------
INSERT INTO site_local_content_versions(id,site_id,revision,status,content,flagged_fields,created_by_person_id)
SELECT 'fd7f0000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',1,'published',
 jsonb_build_object(
  'welcomeMessage','Small-school connection. Big-world possibility. Welcome to Valor School.',
  'localDescription','At Valor, students are known by name, ideas are taken seriously, and learning reaches beyond the screen. Our campus brings together the energy of a neighborhood learning community with a thoughtfully designed hybrid academic experience for grades 9 through 12.',
  'schoolVision','Curious minds. Courageous hearts. A community that sees what each student can become. Our vision is a high-school experience that pairs rigorous learning with genuine connection and a sense of purpose.',
  'leadershipWelcome','Welcome to Valor. We are building a school experience where curiosity is celebrated, questions matter, and every student has the opportunity to contribute. We are glad you are here.',
  'localTraditions','Friday showcases, student-led exhibitions, service Saturdays, and family gatherings make learning visible across the year.',
  'communityOutreach','Learning comes alive when it meets the community. Student projects connect design, technology, local history, and service, from mapping neighborhood resources to exploring the science behind everyday problems.',
  'churchHistory','Valor began as a question: what would a school feel like if every young person had a place to belong, room to think independently, and adults who noticed their potential? Our community grew from that conviction.',
  'spiritualFormation','Faith and purpose shape our community through reflection, meaningful conversation, and opportunities to serve.')
 ,'[]'::jsonb,'f7000000-0000-4000-8000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM site_local_content_versions WHERE site_id='f1000000-0000-4000-8000-000000000003')
ON CONFLICT(id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Enrichment: an after-school extended-learning Program with three
--    activities in open registration for the fall season.
-- ---------------------------------------------------------------------------
INSERT INTO programs(id,organization_id,site_id,jurisdiction_id,type,status,name,slug,grade_range,delivery_model,host_organization_id,academic_provider_organization_id,credit_issuing_organization_id,metadata) VALUES
('fd7f0000-0000-4000-8000-000000000010','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','after_school_enrichment','active','Valor Enrichment','valor-enrichment','{"min":"9","max":"12"}'::jsonb,'{"onsite":true}'::jsonb,'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','{}'::jsonb)
ON CONFLICT(id) DO NOTHING;

INSERT INTO activities(id,site_id,program_id,type,name,status,advisor_person_id,metadata) VALUES
('fd7f0000-0000-4000-8000-000000000011','f1000000-0000-4000-8000-000000000003','fd7f0000-0000-4000-8000-000000000010','club','Robotics & Design Lab','active','fd7a0000-0000-4000-8000-000000000001','{}'::jsonb),
('fd7f0000-0000-4000-8000-000000000012','f1000000-0000-4000-8000-000000000003','fd7f0000-0000-4000-8000-000000000010','club','The Creative Collective','active','fd7a0000-0000-4000-8000-000000000005','{}'::jsonb),
('fd7f0000-0000-4000-8000-000000000013','f1000000-0000-4000-8000-000000000003','fd7f0000-0000-4000-8000-000000000010','club','Neighborhood Impact','active','fd7a0000-0000-4000-8000-000000000004','{}'::jsonb)
ON CONFLICT(id) DO NOTHING;

INSERT INTO activity_seasons(id,activity_id,name,starts_on,ends_on,registration_opens_at,registration_closes_at,fee_amount_cents,status,capacity,metadata) VALUES
('fd7f0000-0000-4000-8000-000000000021','fd7f0000-0000-4000-8000-000000000011','Fall 2026','2026-09-08','2026-12-15','2026-08-01T15:00:00Z','2026-12-01T08:00:00Z',0,'registration',24,'{}'::jsonb),
('fd7f0000-0000-4000-8000-000000000022','fd7f0000-0000-4000-8000-000000000012','Fall 2026','2026-09-09','2026-12-16','2026-08-01T15:00:00Z','2026-12-01T08:00:00Z',0,'registration',20,'{}'::jsonb),
('fd7f0000-0000-4000-8000-000000000023','fd7f0000-0000-4000-8000-000000000013','Fall 2026','2026-09-12','2026-12-12','2026-08-01T15:00:00Z','2026-12-01T08:00:00Z',0,'registration',30,'{}'::jsonb)
ON CONFLICT(id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Admissions pipeline: three prospective families at different stages,
--     plus a seat pool for the active year.
-- ---------------------------------------------------------------------------
INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata) VALUES
('fd7d0000-0000-4000-8000-000000000021','Teresa','Alvarez','Teresa','{"role":"guardian"}'::jsonb),
('fd7d0000-0000-4000-8000-000000000022','Soo-Jin','Park','Soo-Jin','{"role":"guardian"}'::jsonb),
('fd7d0000-0000-4000-8000-000000000023','Robert','Bennett','Robert','{"role":"guardian"}'::jsonb),
('fd7b0000-0000-4000-8000-000000000021','Nico','Alvarez','Nico','{}'::jsonb),
('fd7b0000-0000-4000-8000-000000000022','Hana','Park','Hana','{}'::jsonb),
('fd7b0000-0000-4000-8000-000000000023','June','Bennett','June','{}'::jsonb)
ON CONFLICT(id) DO NOTHING;

INSERT INTO student_profiles(id,person_id,grade_level,metadata) VALUES
('fd7c0000-0000-4000-8000-000000000021','fd7b0000-0000-4000-8000-000000000021','9','{}'::jsonb),
('fd7c0000-0000-4000-8000-000000000022','fd7b0000-0000-4000-8000-000000000022','9','{}'::jsonb),
('fd7c0000-0000-4000-8000-000000000023','fd7b0000-0000-4000-8000-000000000023','10','{}'::jsonb)
ON CONFLICT(id) DO NOTHING;

INSERT INTO households(id,display_name) VALUES
('fd7f0000-0000-4000-8000-000000000031','The Alvarez Family'),
('fd7f0000-0000-4000-8000-000000000032','The Park Family'),
('fd7f0000-0000-4000-8000-000000000033','The Bennett Family')
ON CONFLICT(id) DO NOTHING;

INSERT INTO household_memberships(id,household_id,person_id,relationship_label,is_primary_contact) VALUES
('fd7f0000-0000-4000-8000-000000000034','fd7f0000-0000-4000-8000-000000000031','fd7d0000-0000-4000-8000-000000000021','Guardian',true),
('fd7f0000-0000-4000-8000-000000000035','fd7f0000-0000-4000-8000-000000000031','fd7b0000-0000-4000-8000-000000000021','Student',false),
('fd7f0000-0000-4000-8000-000000000036','fd7f0000-0000-4000-8000-000000000032','fd7d0000-0000-4000-8000-000000000022','Guardian',true),
('fd7f0000-0000-4000-8000-000000000037','fd7f0000-0000-4000-8000-000000000032','fd7b0000-0000-4000-8000-000000000022','Student',false),
('fd7f0000-0000-4000-8000-000000000038','fd7f0000-0000-4000-8000-000000000033','fd7d0000-0000-4000-8000-000000000023','Guardian',true),
('fd7f0000-0000-4000-8000-000000000039','fd7f0000-0000-4000-8000-000000000033','fd7b0000-0000-4000-8000-000000000023','Student',false)
ON CONFLICT (household_id,person_id) DO NOTHING;

INSERT INTO guardian_relationships(id,guardian_person_id,student_person_id,relationship_label,can_view_academics,can_manage_enrollment,metadata) VALUES
('fd7e0000-0000-4000-8000-000000000021','fd7d0000-0000-4000-8000-000000000021','fd7b0000-0000-4000-8000-000000000021','parent',true,true,'{"verification":"verified"}'::jsonb),
('fd7e0000-0000-4000-8000-000000000022','fd7d0000-0000-4000-8000-000000000022','fd7b0000-0000-4000-8000-000000000022','parent',true,true,'{"verification":"verified"}'::jsonb),
('fd7e0000-0000-4000-8000-000000000023','fd7d0000-0000-4000-8000-000000000023','fd7b0000-0000-4000-8000-000000000023','parent',true,true,'{"verification":"verified"}'::jsonb)
ON CONFLICT(id) DO NOTHING;

INSERT INTO applications(id,household_id,student_profile_id,program_id,stage,idempotency_key,submitted_by_person_id,submitted_at,metadata) VALUES
('fd7f0000-0000-4000-8000-000000000041','fd7f0000-0000-4000-8000-000000000031','fd7c0000-0000-4000-8000-000000000021','f1000000-0000-4000-8000-000000000004','inquiry','valor-depth-app-1','fd7d0000-0000-4000-8000-000000000021',now()-interval '12 days','{}'::jsonb),
('fd7f0000-0000-4000-8000-000000000042','fd7f0000-0000-4000-8000-000000000032','fd7c0000-0000-4000-8000-000000000022','f1000000-0000-4000-8000-000000000004','application','valor-depth-app-2','fd7d0000-0000-4000-8000-000000000022',now()-interval '6 days','{}'::jsonb),
('fd7f0000-0000-4000-8000-000000000043','fd7f0000-0000-4000-8000-000000000033','fd7c0000-0000-4000-8000-000000000023','f1000000-0000-4000-8000-000000000004','eligibility','valor-depth-app-3','fd7d0000-0000-4000-8000-000000000023',now()-interval '3 days','{}'::jsonb)
ON CONFLICT(id) DO NOTHING;

INSERT INTO admission_seat_pools(id,program_id,school_year_id,capacity) VALUES
('fd7f0000-0000-4000-8000-000000000051','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000009',120)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 11. Communication: teacher–guardian and staff threads with history.
-- ---------------------------------------------------------------------------
INSERT INTO communication_threads(id,subject,created_by_person_id,last_message_at,metadata) VALUES
('fd7f0000-0000-4000-8000-000000000061','Essay revision plan for Jordan','f1000000-0000-4000-8000-000000000006',now()-interval '1 day','{}'::jsonb),
('fd7f0000-0000-4000-8000-000000000062','Fall showcase planning','f7000000-0000-4000-8000-000000000001',now()-interval '2 days','{}'::jsonb)
ON CONFLICT(id) DO NOTHING;

INSERT INTO communication_participants(id,thread_id,participant_type,participant_id) VALUES
('fd7f0000-0000-4000-8000-000000000063','fd7f0000-0000-4000-8000-000000000061','person','f1000000-0000-4000-8000-000000000006'),
('fd7f0000-0000-4000-8000-000000000064','fd7f0000-0000-4000-8000-000000000061','person','f3000000-0000-4000-8000-000000000007'),
('fd7f0000-0000-4000-8000-000000000065','fd7f0000-0000-4000-8000-000000000062','person','f7000000-0000-4000-8000-000000000001'),
('fd7f0000-0000-4000-8000-000000000066','fd7f0000-0000-4000-8000-000000000062','person','fd7a0000-0000-4000-8000-000000000003'),
('fd7f0000-0000-4000-8000-000000000067','fd7f0000-0000-4000-8000-000000000062','person','fd7a0000-0000-4000-8000-000000000005')
ON CONFLICT(id) DO NOTHING;

INSERT INTO communication_messages(id,thread_id,sender_person_id,body,sent_at,metadata) VALUES
('fd7f0000-0000-4000-8000-000000000071','fd7f0000-0000-4000-8000-000000000061','f1000000-0000-4000-8000-000000000006','Hi Morgan — Jordan and I talked through the essay feedback today. The plan is a revised thesis by Friday, then a full draft next week. Jordan seemed encouraged.',now()-interval '2 days','{}'::jsonb),
('fd7f0000-0000-4000-8000-000000000072','fd7f0000-0000-4000-8000-000000000061','f3000000-0000-4000-8000-000000000007','Thank you for the update. We will make time Thursday evening to review the thesis together at home.',now()-interval '1 day','{}'::jsonb),
('fd7f0000-0000-4000-8000-000000000073','fd7f0000-0000-4000-8000-000000000062','f7000000-0000-4000-8000-000000000001','Planning check-in for the fall showcase: Sarah, can your English 9 sections present their primary-source projects? Maria, could the Creative Collective host the gallery wall?',now()-interval '2 days','{}'::jsonb)
ON CONFLICT(id) DO NOTHING;

COMMIT;
SELECT 'valor-operating-depth applied' AS result;
