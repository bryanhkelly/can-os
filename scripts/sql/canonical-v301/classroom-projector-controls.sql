-- Facilitator command intents are not observed playback or learner watch time.
CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_control_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitated_session_id uuid NOT NULL REFERENCES education_v30.facilitated_learning_sessions(id),
  facilitator_person_id uuid NOT NULL,
  request_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES education_v30.course_lessons(id),
  asset_version_id uuid NOT NULL REFERENCES education_v30.content_asset_versions(id),
  command_kind text NOT NULL CHECK (command_kind IN ('load','play','pause','seek','stop')),
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds BETWEEN 0 AND 43200),
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(facilitated_session_id,request_id)
);
CREATE INDEX IF NOT EXISTS facilitated_room_controls_recent_idx
 ON education_v30.facilitated_room_control_commands(facilitated_session_id,issued_at DESC,id);
ALTER TABLE education_v30.facilitated_room_control_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_room_control_commands FORCE ROW LEVEL SECURITY;
CREATE POLICY facilitated_room_controls_owner_only
 ON education_v30.facilitated_room_control_commands FOR ALL TO neondb_owner
 USING(true) WITH CHECK(true);
CREATE VIEW education_v30.facilitated_room_media_command_evidence
 WITH (security_invoker=true) AS
 SELECT r.id AS facilitated_session_id,r.site_id,r.deployment_id,r.course_version_id,
   count(c.id)::bigint AS control_requests,
   count(c.id) FILTER(WHERE c.command_kind='play')::bigint AS play_requests,
   (SELECT count(*) FROM education_v30.facilitated_learning_playback p
    WHERE p.facilitated_session_id=r.id) AS observed_facilitator_playback_events
 FROM education_v30.facilitated_learning_sessions r
 LEFT JOIN education_v30.facilitated_room_control_commands c
   ON c.facilitated_session_id=r.id
 GROUP BY r.id;
REVOKE ALL ON education_v30.facilitated_room_media_command_evidence FROM PUBLIC;
