-- CAN OS v3.0.1: existing Classroom Connect optional quick ratings.
-- Apply AFTER patch-facilitated-learning.sql to a reviewed canonical database.
-- This is an additive, idempotent schema patch. On Neon main/test01 the table
-- already exists; this file preserves fresh-branch migration parity.
-- Ratings are subjective, identified feedback, NOT attendance or grades.
BEGIN;
CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL
    REFERENCES education_v30.facilitated_learning_sessions(id),
  course_attempt_id uuid NOT NULL
    REFERENCES education_v30.learner_course_attempts(id),
  participant_person_id uuid NOT NULL,
  question_key text NOT NULL CHECK (question_key IN ('clarity','technology','value')),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facilitated_room_feedback_facilitated_session_id_course_att_key
    UNIQUE (facilitated_session_id,course_attempt_id,question_key)
);
CREATE INDEX IF NOT EXISTS facilitated_room_feedback_time_idx
  ON education_v30.facilitated_room_feedback(facilitated_session_id,submitted_at);
ALTER TABLE education_v30.facilitated_room_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_feedback FORCE ROW LEVEL SECURITY;
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='education_v30'
       AND tablename='facilitated_room_feedback'
       AND policyname='facilitated_evidence_owner_only'
  ) THEN
    CREATE POLICY facilitated_evidence_owner_only
      ON education_v30.facilitated_room_feedback FOR ALL TO neondb_owner
      USING (true) WITH CHECK (true);
  END IF;
END $policy$;
REVOKE ALL ON TABLE education_v30.facilitated_room_feedback FROM PUBLIC;
COMMIT;
