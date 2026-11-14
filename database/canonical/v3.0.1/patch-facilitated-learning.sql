-- Facilitated shared-screen learning, separately attributed learner pairing.
-- Apply AFTER patch-learning-session-activity.sql on an approved isolated DB.
-- No official attendance, graded work, or learner completion is created here.
BEGIN;
CREATE TABLE IF NOT EXISTS education_v30.facilitated_learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES education_v30.program_deployments(id),
  course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
  site_id uuid NOT NULL REFERENCES education_v30.sites(id),
  host_organization_id uuid NOT NULL,
  facilitator_person_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'live' CHECK (state IN ('live','ended')),
  pairing_code_digest text NOT NULL,
  pairing_expires_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT facilitated_sessions_lifecycle_ck CHECK (
    (state='live' AND ended_at IS NULL) OR (state='ended' AND ended_at IS NOT NULL)
  ),
  CONSTRAINT facilitated_sessions_id_course_uq UNIQUE (id,course_version_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS facilitated_sessions_code_digest_uq
  ON education_v30.facilitated_learning_sessions(pairing_code_digest);
CREATE INDEX IF NOT EXISTS facilitated_sessions_site_time_idx
  ON education_v30.facilitated_learning_sessions(site_id,started_at DESC);
CREATE INDEX IF NOT EXISTS facilitated_sessions_deployment_time_idx
  ON education_v30.facilitated_learning_sessions(deployment_id,started_at DESC);

CREATE TABLE IF NOT EXISTS education_v30.facilitated_learning_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  course_attempt_id uuid NOT NULL REFERENCES education_v30.learner_course_attempts(id),
  participant_person_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_paired_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  CONSTRAINT facilitated_participant_session_attempt_uq UNIQUE (facilitated_session_id,course_attempt_id)
);
CREATE INDEX IF NOT EXISTS facilitated_participant_attempt_idx
  ON education_v30.facilitated_learning_participants(course_attempt_id);

CREATE TABLE IF NOT EXISTS education_v30.facilitated_learning_playback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
  lesson_id uuid NOT NULL,
  asset_version_id uuid NOT NULL,
  facilitator_person_id uuid NOT NULL,
  request_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('opened','played','paused','ended')),
  position_seconds integer CHECK (position_seconds IS NULL OR position_seconds BETWEEN 0 AND 43200),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facilitated_playback_request_uq UNIQUE (facilitated_session_id,request_id),
  CONSTRAINT facilitated_playback_session_course_fk FOREIGN KEY (facilitated_session_id,course_version_id)
    REFERENCES education_v30.facilitated_learning_sessions(id,course_version_id)
);
CREATE INDEX IF NOT EXISTS facilitated_playback_recent_idx
  ON education_v30.facilitated_learning_playback(facilitated_session_id,occurred_at DESC);

-- No implicit public or unscoped user access. Server owner must enforce
-- site, operation and course-participation checks on every request.
ALTER TABLE education_v30.facilitated_learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_learning_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_learning_playback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON education_v30.facilitated_learning_sessions FROM PUBLIC;
REVOKE ALL ON education_v30.facilitated_learning_participants FROM PUBLIC;
REVOKE ALL ON education_v30.facilitated_learning_playback FROM PUBLIC;
COMMIT;
