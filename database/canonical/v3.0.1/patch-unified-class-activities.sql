-- Reusable Class knowledge checks, feedback and completion-evidence sources.
-- Requires BOTH unified Class migrations first. New QA migration only.
-- DO NOT run against production or test01 without separate migration approval.
-- This is NOT an academic assessment or credential issuance system.
BEGIN;

CREATE TABLE IF NOT EXISTS education_v30.course_activity_sets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
 publisher_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 version_no integer NOT NULL CHECK(version_no>=1),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160),
 quiz_questions jsonb NOT NULL CHECK(jsonb_typeof(quiz_questions)='array'
   AND jsonb_array_length(quiz_questions) BETWEEN 1 AND 10),
 feedback_questions jsonb NOT NULL CHECK(jsonb_typeof(feedback_questions)='array'
   AND jsonb_array_length(feedback_questions)<=10),
 passing_fraction numeric(6,5) NOT NULL CHECK(passing_fraction>=0.1 AND passing_fraction<=1),
 require_all_lessons boolean NOT NULL DEFAULT false,
 feedback_required boolean NOT NULL DEFAULT false,
 feedback_consent_version text NOT NULL CHECK(length(btrim(feedback_consent_version)) BETWEEN 3 AND 60),
 feedback_consent_text text NOT NULL CHECK(length(btrim(feedback_consent_text)) BETWEEN 25 AND 2000),
 state text NOT NULL DEFAULT 'published' CHECK(state IN ('published','closed')),
 created_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 published_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 CONSTRAINT course_activity_publication_window_ck CHECK(
    (state='published' AND closed_at IS NULL)
    OR (state='closed' AND closed_at IS NOT NULL AND closed_at>=published_at)
 ),
 CONSTRAINT course_activity_version_uq UNIQUE(course_version_id,version_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS course_activity_one_published_uq
 ON education_v30.course_activity_sets(course_version_id)
 WHERE state='published';

-- The public Course activity row NEVER contains correct answers.
CREATE TABLE IF NOT EXISTS education_v30_secure.course_activity_answer_keys (
 activity_set_id uuid PRIMARY KEY REFERENCES education_v30.course_activity_sets(id),
 answer_keys jsonb NOT NULL CHECK(jsonb_typeof(answer_keys)='object')
);

CREATE TABLE IF NOT EXISTS education_v30.class_activity_enrollment_pins (
 class_enrollment_id uuid PRIMARY KEY REFERENCES education_v30.class_enrollments(id),
 activity_set_id uuid NOT NULL REFERENCES education_v30.course_activity_sets(id),
 pinned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS class_activity_pins_by_set_idx
 ON education_v30.class_activity_enrollment_pins(activity_set_id);
ALTER TABLE education_v30.class_activity_enrollment_pins
 ADD CONSTRAINT class_activity_pins_pair_uq UNIQUE (class_enrollment_id,activity_set_id);

CREATE TABLE IF NOT EXISTS education_v30.class_activity_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_enrollment_id uuid NOT NULL REFERENCES education_v30.class_enrollments(id),
 activity_set_id uuid NOT NULL REFERENCES education_v30.course_activity_sets(id),
 kind text NOT NULL CHECK(kind IN ('quiz','feedback')),
 request_id uuid NOT NULL,
 quiz_fraction numeric(6,5) CHECK(quiz_fraction IS NULL OR (quiz_fraction>=0 AND quiz_fraction<=1)),
 quiz_passed boolean,
 feedback_consent_version text,
 feedback_consent_sha256 text,
 feedback_consented_at timestamptz,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT class_activity_submission_kind_ck CHECK(
   (kind='quiz' AND quiz_fraction IS NOT NULL AND quiz_passed IS NOT NULL
     AND feedback_consent_version IS NULL AND feedback_consent_sha256 IS NULL
     AND feedback_consented_at IS NULL)
   OR
   (kind='feedback' AND quiz_fraction IS NULL AND quiz_passed IS NULL
     AND feedback_consent_version IS NOT NULL AND feedback_consent_sha256 IS NOT NULL
     AND feedback_consented_at IS NOT NULL)
 ),
 CONSTRAINT class_activity_submission_one_uq UNIQUE(class_enrollment_id,activity_set_id,kind),
 CONSTRAINT class_activity_submission_request_uq UNIQUE(class_enrollment_id,request_id),
 CONSTRAINT class_activity_pin_fk FOREIGN KEY (class_enrollment_id,activity_set_id)
   REFERENCES education_v30.class_activity_enrollment_pins(class_enrollment_id,activity_set_id)
);
CREATE TABLE IF NOT EXISTS education_v30_secure.class_activity_submission_answers (
 submission_id uuid PRIMARY KEY REFERENCES education_v30.class_activity_submissions(id),
 answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='array'),
 recorded_at timestamptz NOT NULL DEFAULT now()
);

-- A Class Enrollment may pin only a currently active Class and exactly the
-- same immutable Course version. Preserve this provenance even for owner-
-- backed SQL clients or a future narrowly granted application role.
CREATE OR REPLACE FUNCTION education_v30.class_activity_pin_source_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $
DECLARE class_course uuid; published_course uuid; class_state text; enrollment_state text;
BEGIN
 SELECT c.course_version_id,c.state,e.status
   INTO class_course,class_state,enrollment_state
   FROM education_v30.class_enrollments e
   JOIN education_v30.classes c ON c.id=e.class_id
   WHERE e.id=NEW.class_enrollment_id;
 SELECT course_version_id INTO published_course
   FROM education_v30.course_activity_sets WHERE id=NEW.activity_set_id;
 IF class_course IS NULL OR published_course IS NULL OR
    class_course<>published_course OR class_state<>'active' OR
    enrollment_state<>'active' THEN
   RAISE EXCEPTION 'Course activity pin must match an active Class Enrollment'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $;
DROP TRIGGER IF EXISTS class_activity_pin_source_trg
 ON education_v30.class_activity_enrollment_pins;
CREATE TRIGGER class_activity_pin_source_trg
 BEFORE INSERT ON education_v30.class_activity_enrollment_pins
 FOR EACH ROW EXECUTE FUNCTION education_v30.class_activity_pin_source_guard();

CREATE OR REPLACE FUNCTION education_v30.course_activity_set_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Published Course activity versions must be preserved' USING ERRCODE='23514';
 END IF;
 IF ROW(OLD.course_version_id,OLD.publisher_organization_id,OLD.version_no,
        OLD.title,OLD.quiz_questions,OLD.feedback_questions,OLD.passing_fraction,
        OLD.require_all_lessons,OLD.feedback_required,OLD.feedback_consent_version,
        OLD.feedback_consent_text,OLD.created_by_person_id,OLD.published_at)
    IS DISTINCT FROM
    ROW(NEW.course_version_id,NEW.publisher_organization_id,NEW.version_no,
        NEW.title,NEW.quiz_questions,NEW.feedback_questions,NEW.passing_fraction,
        NEW.require_all_lessons,NEW.feedback_required,NEW.feedback_consent_version,
        NEW.feedback_consent_text,NEW.created_by_person_id,NEW.published_at)
    OR NOT(
      (OLD.state=NEW.state AND OLD.closed_at IS NOT DISTINCT FROM NEW.closed_at)
      OR (OLD.state='published' AND NEW.state='closed'
          AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL)
    ) THEN
   RAISE EXCEPTION 'Published Course activity content and policy cannot be rewritten'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS course_activity_set_immutable_trg
 ON education_v30.course_activity_sets;
CREATE TRIGGER course_activity_set_immutable_trg
 BEFORE UPDATE OR DELETE ON education_v30.course_activity_sets
 FOR EACH ROW EXECUTE FUNCTION education_v30.course_activity_set_immutable_guard();

CREATE OR REPLACE FUNCTION education_v30.class_activity_append_only_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Class activity evidence is immutable; no update or deletion'
   USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS class_activity_submission_immutable_trg
 ON education_v30.class_activity_submissions;
CREATE TRIGGER class_activity_submission_immutable_trg
 BEFORE UPDATE OR DELETE ON education_v30.class_activity_submissions
 FOR EACH ROW EXECUTE FUNCTION education_v30.class_activity_append_only_guard();

DROP TRIGGER IF EXISTS class_activity_pin_immutable_trg
 ON education_v30.class_activity_enrollment_pins;
CREATE TRIGGER class_activity_pin_immutable_trg
 BEFORE UPDATE OR DELETE ON education_v30.class_activity_enrollment_pins
 FOR EACH ROW EXECUTE FUNCTION education_v30.class_activity_append_only_guard();

DROP TRIGGER IF EXISTS class_activity_answers_immutable_trg
 ON education_v30_secure.class_activity_submission_answers;
CREATE TRIGGER class_activity_answers_immutable_trg
 BEFORE UPDATE OR DELETE ON education_v30_secure.class_activity_submission_answers
 FOR EACH ROW EXECUTE FUNCTION education_v30.class_activity_append_only_guard();

DROP TRIGGER IF EXISTS course_activity_keys_immutable_trg
 ON education_v30_secure.course_activity_answer_keys;
CREATE TRIGGER course_activity_keys_immutable_trg
 BEFORE UPDATE OR DELETE ON education_v30_secure.course_activity_answer_keys
 FOR EACH ROW EXECUTE FUNCTION education_v30.class_activity_append_only_guard();

-- New tables intentionally deny direct application roles pending per-purpose
-- RLS and restricted role tests. Never grant PUBLIC or generic learner SELECT.
DO $$
DECLARE obj text; scope text;
BEGIN
 FOREACH obj IN ARRAY ARRAY['course_activity_sets','class_activity_enrollment_pins',
   'class_activity_submissions'] LOOP
   EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',obj);
   EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',obj);
   EXECUTE format('REVOKE ALL ON education_v30.%I FROM PUBLIC',obj);
   EXECUTE format('CREATE POLICY %I ON education_v30.%I FOR ALL TO neondb_owner USING(true) WITH CHECK(true)',
     obj||'_owner_only',obj);
 END LOOP;
 FOREACH obj IN ARRAY ARRAY['course_activity_answer_keys','class_activity_submission_answers'] LOOP
   EXECUTE format('ALTER TABLE education_v30_secure.%I ENABLE ROW LEVEL SECURITY',obj);
   EXECUTE format('ALTER TABLE education_v30_secure.%I FORCE ROW LEVEL SECURITY',obj);
   EXECUTE format('REVOKE ALL ON education_v30_secure.%I FROM PUBLIC',obj);
   EXECUTE format('CREATE POLICY %I ON education_v30_secure.%I FOR ALL TO neondb_owner USING(true) WITH CHECK(true)',
     obj||'_owner_only',obj);
 END LOOP;
END $$;
COMMIT;
