-- Run only in an EMPTY disposable PostgreSQL database:
-- psql "$EMPTY_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/instructional-tracks-foundation.sql
-- Canonical FK scaffolding below is intentionally minimal. This tests migration constraints,
-- not application authorization or authenticated student journeys. No existing table is dropped.
BEGIN;
CREATE TABLE people (id uuid PRIMARY KEY);
CREATE TABLE organizations (id uuid PRIMARY KEY);
CREATE TABLE course_templates (id uuid PRIMARY KEY);
CREATE TABLE course_template_versions (id uuid PRIMARY KEY, course_template_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE curriculum_resources (id uuid PRIMARY KEY);
CREATE TABLE enrollments (id uuid PRIMARY KEY);
\ir ../../drizzle/0081_instructional_tracks_and_practice.sql

CREATE FUNCTION test_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION expect_track_failure(command text, fragment text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF position(fragment in SQLERRM) = 0 THEN RAISE; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Expected failure containing %, command: %', fragment, command;
END $$;

INSERT INTO people VALUES (test_id(1)),(test_id(2)),(test_id(3));
INSERT INTO organizations VALUES (test_id(4));
INSERT INTO course_templates VALUES (test_id(5)),(test_id(6));
INSERT INTO course_template_versions VALUES (test_id(7),test_id(5),'published'),(test_id(8),test_id(6),'published');
INSERT INTO curriculum_resources VALUES (test_id(9));
INSERT INTO enrollments VALUES (test_id(10));
INSERT INTO instructional_tracks(id,course_template_id,presenter_person_id,producer_organization_id,title,slug)
  VALUES(test_id(11),test_id(5),test_id(1),test_id(4),'Algebra with A','algebra-a');
SELECT expect_track_failure($q$INSERT INTO instructional_track_versions(track_id,course_template_version_id,version,created_by_person_id)
  VALUES(test_id(11),test_id(8),1,test_id(1))$q$, 'same course');
INSERT INTO instructional_track_versions(id,track_id,course_template_version_id,version,created_by_person_id,rights_evidence_resource_id)
  VALUES(test_id(12),test_id(11),test_id(7),1,test_id(1),test_id(9));
INSERT INTO instructional_track_activities(id,track_version_id,publisher_lesson_id,activity_key,title,kind,body,created_by_person_id)
  VALUES(test_id(13),test_id(12),'lesson-1','practice-1','Practice','practice_problem_set','{"instructions":"Solve","prompts":[]}',test_id(1));
INSERT INTO instructional_track_activity_secrets(activity_id,solutions)
  VALUES(test_id(13),'[{"promptKey":"p1","answer":"4","explanation":"Addition"}]');
SELECT expect_track_failure($q$UPDATE instructional_track_activities SET recommendation_level='required' WHERE id=test_id(13)$q$, 'recommendation');
SELECT expect_track_failure($q$UPDATE instructional_track_versions SET status='published',published_at=now() WHERE id=test_id(12)$q$, 'lifecycle transition');
UPDATE instructional_track_versions SET manifest_hash=repeat('a',64),status='in_review' WHERE id=test_id(12);
SELECT expect_track_failure($q$UPDATE instructional_track_activities SET title='Changed' WHERE id=test_id(13)$q$, 'immutable');
SELECT expect_track_failure($q$UPDATE instructional_track_activity_secrets SET solutions='[]' WHERE activity_id=test_id(13)$q$, 'immutable');
SELECT expect_track_failure($q$UPDATE instructional_track_versions SET status='approved' WHERE id=test_id(12)$q$, 'Four independent');
SELECT expect_track_failure($q$INSERT INTO instructional_track_reviews(track_version_id,manifest_hash,criterion,decision,reviewer_person_id,rationale,request_id)
  VALUES(test_id(12),repeat('a',64),'academic','approved',test_id(1),'Self',test_id(20))$q$, 'Independent review');
INSERT INTO instructional_track_reviews(track_version_id,manifest_hash,criterion,decision,reviewer_person_id,rationale,request_id)
  SELECT test_id(12),repeat('a',64),criterion,'approved',test_id(2),'Fixture review',test_id(20+ordinality::int)
  FROM unnest(ARRAY['academic','rights','accessibility','safety']) WITH ORDINALITY AS criteria(criterion,ordinality);
-- All rows share one transaction timestamp. The database decision sequence must
-- still make the latest rejection override an earlier approval.
INSERT INTO instructional_track_reviews(track_version_id,manifest_hash,criterion,decision,reviewer_person_id,rationale,request_id)
  VALUES(test_id(12),repeat('a',64),'academic','rejected',test_id(2),'Needs revision',test_id(40));
SELECT expect_track_failure($q$UPDATE instructional_track_versions SET status='approved' WHERE id=test_id(12)$q$, 'Four independent');
INSERT INTO instructional_track_reviews(track_version_id,manifest_hash,criterion,decision,reviewer_person_id,rationale,request_id)
  VALUES(test_id(12),repeat('a',64),'academic','approved',test_id(2),'Rechecked',test_id(41));
UPDATE instructional_track_versions SET status='approved' WHERE id=test_id(12);
UPDATE instructional_track_versions SET status='published',published_at=now() WHERE id=test_id(12);
SELECT expect_track_failure($q$DELETE FROM instructional_track_reviews$q$, 'append-only');
SELECT expect_track_failure($q$UPDATE instructional_tracks SET presenter_person_id=test_id(3) WHERE id=test_id(11)$q$, 'immutable');
SELECT expect_track_failure($q$UPDATE instructional_track_versions SET course_template_version_id=test_id(8) WHERE id=test_id(12)$q$, 'same course');
INSERT INTO student_instructional_selections(id,section_enrollment_id,track_version_id,selected_by_person_id,selection_source,revision,request_id)
  VALUES(test_id(30),test_id(10),test_id(12),test_id(3),'student',1,test_id(31));
SELECT expect_track_failure($q$INSERT INTO student_instructional_selections(section_enrollment_id,track_version_id,selected_by_person_id,selection_source,revision,request_id)
  VALUES(test_id(10),test_id(12),test_id(3),'student',2,test_id(32))$q$, 'selection_active_uq');
INSERT INTO student_practice_progress(section_enrollment_id,track_activity_id,status,completed_at,last_interaction_at)
  VALUES(test_id(10),test_id(13),'completed',now(),now());
SELECT expect_track_failure($q$UPDATE student_practice_progress SET completed_at=null$q$, 'completion');
UPDATE student_instructional_selections SET superseded_at=now() WHERE id=test_id(30);
INSERT INTO student_instructional_selections(section_enrollment_id,track_version_id,selected_by_person_id,selection_source,revision,request_id)
  VALUES(test_id(10),test_id(12),test_id(3),'student',2,test_id(32));
DO $$ BEGIN
  IF (SELECT count(*) FROM student_practice_progress WHERE status='completed') <> 1 THEN
    RAISE EXCEPTION 'Selection replacement erased practice history';
  END IF;
END $$;
INSERT INTO instructional_track_withdrawals(track_version_id,kind,effective_at,reason,created_by_person_id)
  VALUES(test_id(12),'urgent_safety',now(),'Fixture withdrawal',test_id(2));
SELECT expect_track_failure($q$UPDATE instructional_track_withdrawals SET reason='Hide history'$q$, 'append-only');
SELECT expect_track_failure($q$INSERT INTO instructional_track_withdrawals(track_version_id,kind,effective_at,legacy_access_until,reason,created_by_person_id)
  VALUES(test_id(12),'urgent_rights',now(),now()+interval '1 day','Invalid grace',test_id(2))$q$, 'grace');
ROLLBACK;
