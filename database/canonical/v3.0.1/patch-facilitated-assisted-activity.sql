-- CAN OS Release 3 | facilitator-attributed no-device formative evidence.
-- Additive after canonical v3.0.1 and classroom Phase 2 evidence patches.
-- Never insert into learner-submitted responses or academic grade records.
BEGIN;
CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_assisted_activity_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  activity_release_id uuid NOT NULL REFERENCES education_v30.facilitated_room_activity_releases(id),
  course_attempt_id uuid NOT NULL REFERENCES education_v30.learner_course_attempts(id),
  learner_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
  facilitator_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
  request_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('paper','shared_device','verbal')),
  answer_choice integer CHECK (answer_choice IS NULL OR answer_choice BETWEEN 0 AND 7),
  answer_text text CHECK (answer_text IS NULL OR length(answer_text) BETWEEN 1 AND 1000),
  evidence_note text NOT NULL CHECK (length(evidence_note) BETWEEN 15 AND 500),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facilitated_assisted_activity_answer_ck CHECK (
    (answer_choice IS NOT NULL AND answer_text IS NULL)
    OR (answer_choice IS NULL AND answer_text IS NOT NULL)
  ),
  CONSTRAINT facilitated_assisted_activity_request_uq UNIQUE(facilitated_session_id,request_id)
);
CREATE INDEX IF NOT EXISTS facilitated_assisted_activity_room_idx
  ON education_v30.facilitated_room_assisted_activity_evidence
  (facilitated_session_id,activity_release_id);
CREATE INDEX IF NOT EXISTS facilitated_assisted_activity_attempt_idx
  ON education_v30.facilitated_room_assisted_activity_evidence
  (course_attempt_id,recorded_at);
ALTER TABLE education_v30.facilitated_room_assisted_activity_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_assisted_activity_evidence FORCE ROW LEVEL SECURITY;
DO $policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
    AND tablename='facilitated_room_assisted_activity_evidence'
    AND policyname='facilitated_assisted_activity_owner_only') THEN
    CREATE POLICY facilitated_assisted_activity_owner_only
      ON education_v30.facilitated_room_assisted_activity_evidence
      FOR ALL TO neondb_owner USING(true) WITH CHECK(true);
  END IF;
END $policy$;
REVOKE ALL ON education_v30.facilitated_room_assisted_activity_evidence FROM PUBLIC;
COMMIT;
