ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_verification_requested_at timestamptz;
