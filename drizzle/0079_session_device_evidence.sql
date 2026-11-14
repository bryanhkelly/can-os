-- Additive, idempotent CAN OS security, device and evidence extension.
ALTER TABLE public.access_sessions ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.access_sessions ADD COLUMN IF NOT EXISTS client_instance_id uuid;
ALTER TABLE public.access_sessions ADD COLUMN IF NOT EXISTS device_category text;
ALTER TABLE public.access_sessions ADD COLUMN IF NOT EXISTS browser_family text;
ALTER TABLE public.access_sessions ADD COLUMN IF NOT EXISTS os_family text;
ALTER TABLE public.access_sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.access_sessions ADD COLUMN IF NOT EXISTS network_observed_at timestamptz;
ALTER TABLE public.access_sessions ADD COLUMN IF NOT EXISTS shared_device boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS access_sessions_client_instance_idx ON public.access_sessions(account_id,client_instance_id) WHERE client_instance_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.access_session_signals (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
account_id uuid NOT NULL REFERENCES public.access_accounts(id) ON DELETE CASCADE,
session_id uuid NOT NULL REFERENCES public.access_sessions(id) ON DELETE CASCADE,
signal text NOT NULL CHECK (signal IN ('new_device_profile','concurrent_session','network_changed')),
occurred_at timestamptz NOT NULL DEFAULT now(),
details jsonb NOT NULL DEFAULT '{}'::jsonb,
CONSTRAINT access_session_signals_session_kind_uq UNIQUE(session_id,signal));
CREATE INDEX IF NOT EXISTS access_session_signals_account_time_idx ON public.access_session_signals(account_id,occurred_at DESC);
ALTER TABLE public.access_session_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.canonical_sessions ADD COLUMN IF NOT EXISTS client_instance_id uuid;
ALTER TABLE education_v30.canonical_sessions ADD COLUMN IF NOT EXISTS device_category text;
ALTER TABLE education_v30.canonical_sessions ADD COLUMN IF NOT EXISTS browser_family text;
ALTER TABLE education_v30.canonical_sessions ADD COLUMN IF NOT EXISTS os_family text;
ALTER TABLE education_v30.canonical_sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE education_v30.canonical_sessions ADD COLUMN IF NOT EXISTS network_observed_at timestamptz;
ALTER TABLE education_v30.canonical_sessions ADD COLUMN IF NOT EXISTS shared_device boolean NOT NULL DEFAULT false;
ALTER TABLE education_v30.learning_session_events ADD COLUMN IF NOT EXISTS evidence_level text NOT NULL DEFAULT 'client_observed';
ALTER TABLE education_v30.learning_session_events DROP CONSTRAINT IF EXISTS learning_session_events_evidence_level_ck;
ALTER TABLE education_v30.learning_session_events ADD CONSTRAINT learning_session_events_evidence_level_ck CHECK (evidence_level IN ('self_reported','client_observed','server_verified','facilitator_attested','independently_assessed'));
CREATE TABLE IF NOT EXISTS education_v30.site_device_registrations (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
site_id uuid NOT NULL REFERENCES education_v30.sites(id),
asset_id uuid REFERENCES education_v30.equipment_assets(id),
label text NOT NULL,
device_category text NOT NULL CHECK (device_category IN ('desktop','laptop','tablet','phone','chromebook','other')),
ownership text NOT NULL CHECK (ownership IN ('site','organization','loaned','personal')),
managed boolean NOT NULL DEFAULT false,
status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','repair','retired','lost')),
enrolled_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS site_device_registrations_asset_uq ON education_v30.site_device_registrations(site_id,asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS site_device_registrations_site_status_idx ON education_v30.site_device_registrations(site_id,status);
ALTER TABLE education_v30.site_device_registrations ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS education_v30.site_device_policies (
site_id uuid PRIMARY KEY REFERENCES education_v30.sites(id),
shared_device_required boolean NOT NULL DEFAULT false,
managed_device_required_for_assessments boolean NOT NULL DEFAULT false,
kiosk_idle_minutes integer NOT NULL DEFAULT 5 CHECK (kiosk_idle_minutes BETWEEN 1 AND 30),
allowed_categories text[] NOT NULL DEFAULT ARRAY['desktop','laptop','tablet','phone','chromebook','other']::text[],
updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE education_v30.site_device_policies ENABLE ROW LEVEL SECURITY;
