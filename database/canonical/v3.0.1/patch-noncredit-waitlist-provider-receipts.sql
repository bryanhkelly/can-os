-- Add provider-confirmed delivery evidence to the existing noncredit waitlist
-- email receipt. Keep canonical ownership, RLS, invitation uniqueness, and
-- enrollment status unchanged. Apply before deploying the matching adapter.
BEGIN;
ALTER TABLE education_v30.noncredit_waitlist_email_deliveries
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_failure_kind text;
CREATE UNIQUE INDEX IF NOT EXISTS noncredit_waitlist_email_provider_message_uq
  ON education_v30.noncredit_waitlist_email_deliveries(provider_message_id);
ALTER TABLE education_v30.noncredit_waitlist_email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.noncredit_waitlist_email_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON education_v30.noncredit_waitlist_email_deliveries FROM PUBLIC;
COMMIT;
