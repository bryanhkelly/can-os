-- Explicit one-time, audited seat reconciliation. A historical claim remains
-- append-only and a completed learner is never made withdrawable.
BEGIN;
CREATE TABLE IF NOT EXISTS education_v30.noncredit_released_seats(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES education_v30.noncredit_self_enrollment_releases(id),
  registration_id uuid NOT NULL UNIQUE REFERENCES education_v30.noncredit_registrations(id),
  released_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 15 AND 500),
  released_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS noncredit_released_seats_release_idx
  ON education_v30.noncredit_released_seats(release_id);

CREATE OR REPLACE FUNCTION education_v30.verify_noncredit_released_seat()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'Released seat evidence is immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM education_v30.noncredit_self_enrollment_claims c
    JOIN education_v30.noncredit_registrations r ON r.id=c.registration_id
    WHERE c.release_id=NEW.release_id
      AND c.registration_id=NEW.registration_id
      AND r.status IN ('withdrawn','cancelled')
  ) THEN
    RAISE EXCEPTION 'Only a withdrawn registration at this release can free a seat'
      USING ERRCODE='23514';
  END IF;
  IF EXISTS(
    SELECT 1 FROM education_v30.noncredit_completion_decisions d
    WHERE d.registration_id=NEW.registration_id AND d.outcome='completed'
      AND NOT EXISTS (
        SELECT 1 FROM education_v30.noncredit_completion_decisions later
        WHERE later.supersedes_id=d.id
      )
  ) THEN
    RAISE EXCEPTION 'A completed outcome cannot release a seat'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger
    WHERE tgname='noncredit_released_seat_immutable_guard'
      AND tgrelid='education_v30.noncredit_released_seats'::regclass)
  THEN
    CREATE TRIGGER noncredit_released_seat_immutable_guard
      BEFORE INSERT OR UPDATE OR DELETE ON education_v30.noncredit_released_seats
      FOR EACH ROW EXECUTE FUNCTION education_v30.verify_noncredit_released_seat();
  END IF;
END $$;
ALTER TABLE education_v30.noncredit_released_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.noncredit_released_seats FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies
    WHERE schemaname='education_v30' AND tablename='noncredit_released_seats'
      AND policyname='noncredit_released_seats_owner_only')
  THEN
    CREATE POLICY noncredit_released_seats_owner_only
      ON education_v30.noncredit_released_seats
      FOR ALL TO neondb_owner USING(true) WITH CHECK(true);
  END IF;
END $$;
REVOKE ALL ON education_v30.noncredit_released_seats FROM PUBLIC;
COMMIT;
