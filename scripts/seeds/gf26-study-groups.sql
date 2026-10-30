-- SYNTHETIC ONLY. Run after gf26 migration and foundational student/site fixtures.
-- Idempotent, no live student information.
DO $$
DECLARE sid uuid := 'f1000000-0000-4000-8000-000000000003';
 teacher uuid := 'f1000000-0000-4000-8000-000000000006';
 student uuid := 'f1000000-0000-4000-8000-000000000005';
 gid uuid := 'f2600000-0000-4000-8000-000000000001';
 iid uuid := 'f2600000-0000-4000-8000-000000000002';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sites WHERE id=sid AND metadata @> '{"synthetic":true}')
    OR NOT EXISTS(SELECT 1 FROM people WHERE id=teacher AND metadata @> '{"synthetic":true}')
    OR NOT EXISTS(SELECT 1 FROM people WHERE id=student AND metadata @> '{"synthetic":true}') THEN
  RAISE EXCEPTION 'GF26 synthetic prerequisites not found; refusing incomplete seed';
 END IF;
 INSERT INTO study_groups(id,title,description,kind,site_id,facilitator_person_id,metadata)
 VALUES(gid,'Algebra II Study Circle','Weekly collaborative practice, questions and exam preparation.','course',sid,teacher,'{"synthetic":true,"fixture":"gf26"}')
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO study_groups(id,title,description,kind,site_id,facilitator_person_id,metadata)
 VALUES(iid,'Creative Writing Collective','Cross-course writing feedback and peer workshops.','interest',sid,teacher,'{"synthetic":true,"fixture":"gf26"}')
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO study_group_memberships(group_id,person_id,status,role,reviewed_by_person_id,joined_at)
 VALUES(gid,student,'approved','student',teacher,'2026-10-01T16:00:00Z')
 ON CONFLICT(group_id,person_id) DO NOTHING;
 INSERT INTO study_group_memberships(group_id,person_id,status,role)
 VALUES(iid,student,'pending','student')
 ON CONFLICT(group_id,person_id) DO NOTHING;
 INSERT INTO study_group_sessions(id,group_id,title,agenda,starts_at,ends_at)
 VALUES
 ('f2600000-0000-4000-8000-000000000010',gid,'Algebra problem-solving','Quadratics and factorization','2026-11-02T18:00:00Z','2026-11-02T19:00:00Z'),
 ('f2600000-0000-4000-8000-000000000011',gid,'Completed study session','Review and recovery','2026-10-01T18:00:00Z','2026-10-01T19:00:00Z')
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO study_group_posts(id,group_id,author_person_id,body,hidden)
 VALUES
 ('f2600000-0000-4000-8000-000000000020',gid,student,'Which strategy works best for completing the square?',false),
 ('f2600000-0000-4000-8000-000000000021',gid,student,'Synthetic moderation example: hidden for facilitator review.',true)
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO study_group_reports(id,group_id,reporter_person_id,post_id,reason)
 VALUES('f2600000-0000-4000-8000-000000000030',gid,student,'f2600000-0000-4000-8000-000000000021','Synthetic safeguarding review example.')
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO study_group_session_attendance(session_id,person_id,rsvp,attended,recorded_by_person_id)
 VALUES
 ('f2600000-0000-4000-8000-000000000010',student,'going',null,null),
 ('f2600000-0000-4000-8000-000000000011',student,'going',true,teacher)
 ON CONFLICT(session_id,person_id) DO NOTHING;
 INSERT INTO calendar_events(id,type,title,description,starts_at,ends_at,timezone,organization_id,site_id,source_type,source_id,created_by_person_id,metadata)
 SELECT
 CASE WHEN session.id='f2600000-0000-4000-8000-000000000010'::uuid
 THEN 'f2600000-0000-4000-8000-000000000040'::uuid
 ELSE 'f2600000-0000-4000-8000-000000000041'::uuid END,
 'study_group',session.title,session.agenda,session.starts_at,session.ends_at,
 site.timezone,site.organization_id,sid,'study_group_session',session.id,teacher,
 jsonb_build_object('synthetic',true,'fixture','gf26','groupId',gid)
 FROM study_group_sessions session JOIN sites site ON site.id=sid
 WHERE session.id IN ('f2600000-0000-4000-8000-000000000010','f2600000-0000-4000-8000-000000000011')
 ON CONFLICT(id) DO NOTHING;
END $$;
