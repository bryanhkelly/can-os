-- Classroom Connect Phase 2: non-authoritative evidence and pilot reporting.
-- Apply after canonical v3.0.1 + facilitated learning foundation. Additive, idempotent.
-- No evidence below automatically grants attendance, academic credit or completion.

CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_activity_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  released_by_person_id uuid NOT NULL,
  request_id uuid NOT NULL,
  lesson_id uuid REFERENCES education_v30.course_lessons(id),
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 5 AND 1000),
  answer_type text NOT NULL CHECK (answer_type IN ('single_choice','text')),
  choices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(choices)='array'),
  released_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (facilitated_session_id,request_id)
);
CREATE INDEX IF NOT EXISTS facilitated_room_release_session_time_idx ON education_v30.facilitated_room_activity_releases (facilitated_session_id,released_at DESC);

CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_activity_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  activity_release_id uuid NOT NULL REFERENCES education_v30.facilitated_room_activity_releases(id),
  course_attempt_id uuid NOT NULL REFERENCES education_v30.learner_course_attempts(id),
  participant_person_id uuid NOT NULL,
  client_submission_id uuid NOT NULL,
  client_instance_id uuid NOT NULL,
  answer_choice integer,
  answer_text text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((answer_choice IS NOT NULL) <> (answer_text IS NOT NULL)),
  CHECK (answer_choice IS NULL OR answer_choice BETWEEN 0 AND 7),
  CHECK (answer_text IS NULL OR length(answer_text) BETWEEN 1 AND 1000),
  UNIQUE (activity_release_id,course_attempt_id,client_submission_id)
);
CREATE INDEX IF NOT EXISTS facilitated_room_responses_attempt_idx ON education_v30.facilitated_room_activity_responses (course_attempt_id,submitted_at DESC);
CREATE INDEX IF NOT EXISTS facilitated_room_responses_room_idx ON education_v30.facilitated_room_activity_responses (facilitated_session_id,activity_release_id);

CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_presence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  course_attempt_id uuid NOT NULL REFERENCES education_v30.learner_course_attempts(id),
  participant_person_id uuid NOT NULL,
  client_instance_id uuid NOT NULL,
  client_event_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('joined','heartbeat','away','left')),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facilitated_session_id,course_attempt_id,client_event_id)
);
CREATE INDEX IF NOT EXISTS facilitated_room_presence_room_recent_idx ON education_v30.facilitated_room_presence_events (facilitated_session_id,received_at DESC);
CREATE INDEX IF NOT EXISTS facilitated_room_presence_attempt_idx ON education_v30.facilitated_room_presence_events (course_attempt_id,received_at DESC);

CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_attendance_assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  course_attempt_id uuid NOT NULL REFERENCES education_v30.learner_course_attempts(id),
  facilitator_person_id uuid NOT NULL,
  request_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','unknown')),
  method text NOT NULL CHECK (method IN ('in_person_roll_call','remote_live_check')),
  evidence_note text CHECK (evidence_note IS NULL OR length(evidence_note) <= 250),
  asserted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facilitated_session_id,request_id)
);
CREATE INDEX IF NOT EXISTS facilitated_room_attendance_latest_idx ON education_v30.facilitated_room_attendance_assertions (facilitated_session_id,course_attempt_id,asserted_at DESC);

CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  course_attempt_id uuid NOT NULL REFERENCES education_v30.learner_course_attempts(id),
  participant_person_id uuid NOT NULL,
  question_key text NOT NULL CHECK (question_key IN ('clarity','technology','value')),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facilitated_session_id,course_attempt_id,question_key)
);
CREATE INDEX IF NOT EXISTS facilitated_room_feedback_time_idx ON education_v30.facilitated_room_feedback (facilitated_session_id,submitted_at);

-- Existing canonical survey campaigns can be linked to a facilitated room
-- without hardcoding the questions or copying confidential responses.
CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_survey_campaigns (
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  survey_campaign_id uuid NOT NULL REFERENCES education_v30.survey_campaigns(id),
  stage text NOT NULL CHECK (stage IN ('entry','pulse','exit')),
  linked_by_person_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (facilitated_session_id,survey_campaign_id,stage)
);

ALTER TABLE education_v30.facilitated_room_activity_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_activity_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_activity_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_activity_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_presence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_presence_events FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_attendance_assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_attendance_assertions FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_survey_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_survey_campaigns FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facilitated_evidence_owner_only ON education_v30.facilitated_room_activity_releases;
CREATE POLICY facilitated_evidence_owner_only ON education_v30.facilitated_room_activity_releases FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS facilitated_evidence_owner_only ON education_v30.facilitated_room_activity_responses;
CREATE POLICY facilitated_evidence_owner_only ON education_v30.facilitated_room_activity_responses FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS facilitated_evidence_owner_only ON education_v30.facilitated_room_presence_events;
CREATE POLICY facilitated_evidence_owner_only ON education_v30.facilitated_room_presence_events FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS facilitated_evidence_owner_only ON education_v30.facilitated_room_attendance_assertions;
CREATE POLICY facilitated_evidence_owner_only ON education_v30.facilitated_room_attendance_assertions FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS facilitated_evidence_owner_only ON education_v30.facilitated_room_feedback;
CREATE POLICY facilitated_evidence_owner_only ON education_v30.facilitated_room_feedback FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS facilitated_evidence_owner_only ON education_v30.facilitated_room_survey_campaigns;
CREATE POLICY facilitated_evidence_owner_only ON education_v30.facilitated_room_survey_campaigns FOR ALL TO neondb_owner USING (true) WITH CHECK (true);

-- Reporting dataset: a row per room with independent aggregates, avoiding
-- inflated joins. Only authorized backend code may read this owner-only view.
CREATE OR REPLACE VIEW education_v30.facilitated_room_pilot_evidence
WITH (security_invoker=true) AS
SELECT s.id AS facilitated_session_id,s.site_id,s.deployment_id,s.course_version_id,
  s.started_at,s.ended_at,date_trunc('week',s.started_at) AS week_start,
  (SELECT count(*) FROM education_v30.facilitated_learning_participants p
    WHERE p.facilitated_session_id=s.id) AS paired_attempts,
  (SELECT count(DISTINCT pe.course_attempt_id) FROM education_v30.facilitated_room_presence_events pe
    WHERE pe.facilitated_session_id=s.id) AS presence_observed_attempts,
  (SELECT count(*) FROM education_v30.facilitated_room_activity_releases ar
    WHERE ar.facilitated_session_id=s.id) AS activities_released,
  (SELECT count(*) FROM education_v30.facilitated_room_activity_responses rr
    WHERE rr.facilitated_session_id=s.id) AS response_events,
  (SELECT count(DISTINCT rr.course_attempt_id) FROM education_v30.facilitated_room_activity_responses rr
    WHERE rr.facilitated_session_id=s.id) AS responding_attempts,
  (SELECT count(*) FROM (
    SELECT DISTINCT ON (a.course_attempt_id) a.status
    FROM education_v30.facilitated_room_attendance_assertions a
    WHERE a.facilitated_session_id=s.id
    ORDER BY a.course_attempt_id,a.asserted_at DESC,a.id DESC
  ) last_attendance WHERE last_attendance.status='present') AS facilitator_attested_present,
  (SELECT count(*) FROM education_v30.facilitated_room_feedback fb
    WHERE fb.facilitated_session_id=s.id) AS feedback_ratings
FROM education_v30.facilitated_learning_sessions s;
REVOKE ALL ON education_v30.facilitated_room_pilot_evidence FROM PUBLIC;
