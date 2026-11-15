-- Rehearsals are explicitly separate from learner rooms and never produce attendance.
CREATE TABLE IF NOT EXISTS education_v30.facilitated_rehearsal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES education_v30.program_deployments(id),
  course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
  site_id uuid NOT NULL REFERENCES education_v30.sites(id),
  facilitator_person_id uuid NOT NULL,
  request_id uuid NOT NULL,
  lesson_id uuid REFERENCES education_v30.course_lessons(id),
  asset_version_id uuid REFERENCES education_v30.content_asset_versions(id),
  kind text NOT NULL CHECK (kind IN ('opened','played','paused','ended')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id,facilitator_person_id,request_id)
);
CREATE INDEX IF NOT EXISTS facilitated_rehearsal_events_site_idx ON education_v30.facilitated_rehearsal_events(site_id,occurred_at DESC);
ALTER TABLE education_v30.facilitated_rehearsal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_rehearsal_events FORCE ROW LEVEL SECURITY;
DO $policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
    AND tablename='facilitated_rehearsal_events' AND policyname='facilitated_rehearsal_owner_only') THEN
    CREATE POLICY facilitated_rehearsal_owner_only ON education_v30.facilitated_rehearsal_events
      FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
  END IF;
END $policy$;
