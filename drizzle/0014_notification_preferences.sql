CREATE TABLE IF NOT EXISTS notification_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
 timezone text NOT NULL DEFAULT 'UTC',
 quiet_start text,
 quiet_end text,
 sms_opted_in boolean NOT NULL DEFAULT false,
 sms_consent_at timestamptz,
 sms_verified_phone text,
 sms_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_person_uq ON notification_preferences(person_id);
CREATE INDEX IF NOT EXISTS notification_preferences_sms_idx ON notification_preferences(sms_opted_in);
