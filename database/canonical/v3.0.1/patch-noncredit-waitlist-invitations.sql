-- Bounded first-class waiting queue and invitation holds for adult noncredit
-- registration. A waiting record is not an enrollment or a learner grant.
-- Native CAN account and Person IDs are separate from canonical identity.
BEGIN;
CREATE TABLE IF NOT EXISTS education_v30.noncredit_enrollment_waitlist(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES education_v30.noncredit_self_enrollment_releases(id),
  access_account_id uuid NOT NULL REFERENCES public.access_accounts(id),
  access_person_id uuid NOT NULL REFERENCES public.people(id),
  consent_version text NOT NULL,
  consent_sha256 text NOT NULL CHECK(consent_sha256 ~ '^[a-f0-9]{64}$'),
  adult_attested boolean NOT NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK(status IN ('waiting','invited','accepted','cancelled')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  invited_at timestamptz,
  invite_expires_at timestamptz,
  accepted_registration_id uuid REFERENCES education_v30.noncredit_registrations(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT noncredit_waitlist_release_account_uq UNIQUE(release_id,access_account_id),
  CONSTRAINT noncredit_waitlist_invitation_ck CHECK(
    (status='invited' AND invited_at IS NOT NULL AND invite_expires_at IS NOT NULL
      AND accepted_registration_id IS NULL)
    OR (status='accepted' AND accepted_registration_id IS NOT NULL)
    OR (status IN ('waiting','cancelled') AND accepted_registration_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS noncredit_waitlist_queue_idx
  ON education_v30.noncredit_enrollment_waitlist(release_id,status,joined_at);
CREATE INDEX IF NOT EXISTS noncredit_waitlist_live_invites_idx
  ON education_v30.noncredit_enrollment_waitlist(release_id,invite_expires_at)
  WHERE status='invited';
ALTER TABLE education_v30.noncredit_enrollment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.noncredit_enrollment_waitlist FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies
    WHERE schemaname='education_v30' AND tablename='noncredit_enrollment_waitlist'
      AND policyname='noncredit_waitlist_owner_only')
  THEN
    CREATE POLICY noncredit_waitlist_owner_only
      ON education_v30.noncredit_enrollment_waitlist
      FOR ALL TO neondb_owner USING(true) WITH CHECK(true);
  END IF;
END $$;
REVOKE ALL ON education_v30.noncredit_enrollment_waitlist FROM PUBLIC;
COMMIT;
