-- CAN OS Release 3 | classroom calendar overlay.
-- Run after v3.0.1 and patch-facilitated-learning.sql.
-- Canonical delivery_sessions owns date/modality/Site and room constraints.
-- This table only adds a scoped Course, facilitating organization/person and
-- live-room linkage. No learner attendance, grades or enrollment created.
BEGIN;
CREATE TABLE IF NOT EXISTS education_v30.facilitated_classroom_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_session_id uuid NOT NULL
    REFERENCES education_v30.delivery_sessions(id),
  deployment_id uuid NOT NULL REFERENCES education_v30.program_deployments(id),
  course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
  site_id uuid NOT NULL REFERENCES education_v30.sites(id),
  host_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
  facilitator_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
  request_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled','started','cancelled')),
  facilitated_session_id uuid REFERENCES education_v30.facilitated_learning_sessions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facilitated_classroom_plans_link_ck CHECK (
    (state='started' AND facilitated_session_id IS NOT NULL)
    OR (state IN ('scheduled','cancelled') AND facilitated_session_id IS NULL)
  ),
  CONSTRAINT facilitated_plans_delivery_session_uq UNIQUE (delivery_session_id),
  CONSTRAINT facilitated_plans_request_uq UNIQUE
    (host_organization_id,facilitator_person_id,request_id),
  CONSTRAINT facilitated_plans_live_room_uq UNIQUE (facilitated_session_id),
  CONSTRAINT facilitated_plans_id_deployment_uq UNIQUE (id,deployment_id)
);
CREATE INDEX IF NOT EXISTS facilitated_plans_facilitator_idx
  ON education_v30.facilitated_classroom_plans
    (host_organization_id,facilitator_person_id,state);
CREATE INDEX IF NOT EXISTS facilitated_plans_site_course_idx
  ON education_v30.facilitated_classroom_plans (site_id,course_version_id);
ALTER TABLE education_v30.facilitated_classroom_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.facilitated_classroom_plans FORCE ROW LEVEL SECURITY;
DO $policy$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
      AND tablename='facilitated_classroom_plans'
      AND policyname='facilitated_classroom_plans_owner_only'
  ) THEN
    CREATE POLICY facilitated_classroom_plans_owner_only
      ON education_v30.facilitated_classroom_plans
      FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
  END IF;
END $policy$;
REVOKE ALL ON education_v30.facilitated_classroom_plans FROM PUBLIC;
COMMIT;
