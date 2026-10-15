-- SYNTHETIC ONLY. Run after gf26 migration and foundational student/site fixtures.
-- Idempotent, no live student information.
DO $$
DECLARE sid uuid := 'f1000000-0000-4000-8000-000000000003';
 teacher uuid := 'f1000000-0000-4000-8000-000000000006';
 student uuid := 'f1000000-0000-4000-8000-000000000005';
 gid uuid := 'f2600000-0000-4000-8000-000000000001';
 iid uuid := 'f2600000-0000-4000-8000-000000000002';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sites WHERE id=sid)
    OR NOT EXISTS(SELECT 1 FROM people WHERE id=teacher)
    OR NOT EXISTS(SELECT 1 FROM people WHERE id=student) THEN
  RAISE EXCEPTION 'GF26 synthetic prerequisites not found; refusing incomplete seed';
 END IF;
 INSERT INTO study_groups(id,title,description,kind,site_id,facilitator_person_id,metadata)
 VALUES(gid,'Algebra II Study Circle','Weekly collaborative practice, questions and exam preparation.','course',sid,teacher,'{"synthetic":true,"fixture":"gf26"}')
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO study_groups(id,title,description,kind,site_id,facilitator_person_id,metadata)
 VALUES(iid,'Creative Writing Collective','Cross-course writing feedback and peer workshops.','interest',sid,teacher,'{"synthetic":true,"fixture":"gf26"}')
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO study_group_memberships(group_id,person_id,status,role,reviewed_by_person_id,joined_at)
 VALUES(gid,student,'approved','student',teacher,now())
 ON CONFLICT(group_id,person_id) DO NOTHING;
 INSERT INTO study_group_sessions(group_id,title,agenda,starts_at,ends_at)
 SELECT gid,'Algebra problem-solving','Quadratics and factorization',now()+interval '7 days',now()+interval '7 days 1 hour'
 WHERE NOT EXISTS(SELECT 1 FROM study_group_sessions WHERE group_id=gid AND title='Algebra problem-solving');
 INSERT INTO study_group_posts(group_id,author_person_id,body)
 SELECT gid,student,'Which strategy works best for completing the square?'
 WHERE NOT EXISTS(SELECT 1 FROM study_group_posts WHERE group_id=gid AND body='Which strategy works best for completing the square?');
END $$;
