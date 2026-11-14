-- CAN OS canonical learner session and bounded learning-event evidence.
-- Execute on an authorized disposable Neon branch first. Do not run on main without approval.
-- This patch does not mark academic attendance, course completion, scores, or credit.
BEGIN;
CREATE TABLE IF NOT EXISTS education_v30.learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_attempt_id uuid NOT NULL REFERENCES education_v30.learner_course_attempts(id) ON DELETE RESTRICT,
  course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id) ON DELETE RESTRICT,
  access_session_id uuid NOT NULL,
  client_instance_id uuid NOT NULL,
  participant_person_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','paused','ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_interaction_at timestamptz,
  last_foreground boolean NOT NULL DEFAULT false,
  last_lesson_id uuid,
  ended_at timestamptz,
  estimated_active_ms integer NOT NULL DEFAULT 0 CHECK (estimated_active_ms >= 0),
  CONSTRAINT canonical_learning_sessions_end_chk CHECK (
    (ended_at IS NULL AND state <> 'ended') OR (ended_at IS NOT NULL AND state = 'ended')
  )
);
CREATE INDEX IF NOT EXISTS canonical_learning_sessions_attempt_idx
  ON education_v30.learning_sessions (course_attempt_id, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS canonical_learning_sessions_live_idx
  ON education_v30.learning_sessions (course_attempt_id, access_session_id, client_instance_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS education_v30.learning_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_session_id uuid NOT NULL REFERENCES education_v30.learning_sessions(id) ON DELETE RESTRICT,
  course_attempt_id uuid NOT NULL REFERENCES education_v30.learner_course_attempts(id) ON DELETE RESTRICT,
  client_event_id uuid NOT NULL,
  request_digest text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'lesson_opened','lesson_resumed','resource_opened',
    'video_opened','video_played','video_ended','engaged_interval'
  )),
  lesson_id uuid,
  resource_id text,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  estimated_active_ms integer NOT NULL DEFAULT 0 CHECK (estimated_active_ms >= 0),
  CONSTRAINT canonical_learning_events_dedupe_uq UNIQUE (learning_session_id, client_event_id)
);
CREATE INDEX IF NOT EXISTS canonical_learning_events_attempt_time_idx
  ON education_v30.learning_session_events (course_attempt_id, received_at DESC);

-- Do not grant public table privileges: server commands must authorize current Course attempt.
REVOKE ALL ON education_v30.learning_sessions FROM PUBLIC;
REVOKE ALL ON education_v30.learning_session_events FROM PUBLIC;
COMMIT;
