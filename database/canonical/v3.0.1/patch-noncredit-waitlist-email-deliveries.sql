-- CAN OS v3.0.1 | Durable per-invitation email delivery. Additive.
-- No applicant email or authentication secret is stored here.
BEGIN;
CREATE TABLE IF NOT EXISTS education_v30.noncredit_waitlist_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waitlist_id uuid NOT NULL REFERENCES education_v30.noncredit_enrollment_waitlist(id),
  invitation_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','accepted','failed','suppressed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  next_attempt_at timestamptz,
  lease_until timestamptz,
  accepted_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT noncredit_waitlist_email_invitation_uq
    UNIQUE (waitlist_id,invitation_expires_at)
);
CREATE INDEX IF NOT EXISTS noncredit_waitlist_email_retry_idx
  ON education_v30.noncredit_waitlist_email_deliveries(status,next_attempt_at);
ALTER TABLE education_v30.noncredit_waitlist_email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.noncredit_waitlist_email_deliveries FORCE ROW LEVEL SECURITY;
DO $policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
    AND tablename='noncredit_waitlist_email_deliveries'
    AND policyname='noncredit_waitlist_email_owner_only') THEN
    CREATE POLICY noncredit_waitlist_email_owner_only
      ON education_v30.noncredit_waitlist_email_deliveries
      FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
  END IF;
END $policy$;
REVOKE ALL ON education_v30.noncredit_waitlist_email_deliveries FROM PUBLIC;
COMMIT;
