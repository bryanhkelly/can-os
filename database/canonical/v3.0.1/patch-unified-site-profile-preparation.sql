-- Preparation ONLY for ADR: one platform Site identity.
-- Do NOT apply to production or test01 until the reviewed migration window.
-- This migration is additive: it creates an educational extension keyed by
-- public.sites.id. No duplicate Site IDs, copied names, identity bridges,
-- automatic matching, permissions, or backfills are created here.
--
-- On the final cutover, all education_v30.* site_id FKs must refer directly
-- to public.sites(id); the existing education_v30.sites table is retired.
-- This script intentionally leaves existing FKs and production data unchanged.
BEGIN;

CREATE TABLE education_v30.site_profiles (
  site_id uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE RESTRICT,
  education_code text NOT NULL UNIQUE CHECK (length(btrim(education_code)) > 0),
  site_kind text NOT NULL CHECK (site_kind IN ('physical','virtual','mobile')),
  geographic_area_id uuid REFERENCES education_v30.geographic_areas(id),
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  education_status text NOT NULL DEFAULT 'planning'
    CHECK (education_status IN ('planning','active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE education_v30.site_profiles IS
  'Education-only configuration for the SINGLE authoritative public.sites row. A profile is not an independent Site, identity alias, or authorization.';

CREATE INDEX site_profiles_geography_idx
  ON education_v30.site_profiles(geographic_area_id);

ALTER TABLE education_v30.site_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.site_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON education_v30.site_profiles FROM PUBLIC;

-- No reader/writer role, unrestricted policy, or data insert is authorized
-- by this preparation step. Purpose-scoped least-privilege grants must be
-- separately reviewed with all canonical service reads and authorizations.
COMMIT;
