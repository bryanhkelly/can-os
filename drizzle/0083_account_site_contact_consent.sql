-- Consent to reuse non-sensitive CAN contact fields at a named Site.
-- Append-only revision rows; no favorites, school grants or memberships implied.
CREATE TABLE IF NOT EXISTS public.access_site_contact_share_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.access_accounts(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  revision_no integer NOT NULL CHECK (revision_no >= 1),
  decision text NOT NULL CHECK (decision IN ('grant','revoke')),
  share_email boolean NOT NULL,
  share_name boolean NOT NULL,
  share_phone boolean NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('program_inquiry','school_application','staff_onboarding')),
  consent_version text NOT NULL CHECK (consent_version = 'can-site-contact-v1'),
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_site_contact_share_revision_uq UNIQUE(account_id,person_id,site_id,revision_no),
  CONSTRAINT access_site_contact_share_active_fields_ck CHECK (
    (decision='grant' AND share_email=true AND share_name=true) OR
    (decision='revoke' AND share_email=false AND share_name=false AND share_phone=false)
  )
);
CREATE INDEX IF NOT EXISTS access_site_contact_share_site_idx
  ON public.access_site_contact_share_revisions(site_id, person_id, decided_at DESC);
ALTER TABLE public.access_site_contact_share_revisions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='access_site_contact_share_revisions'
      AND policyname='account_contact_shares_own_only') THEN
    CREATE POLICY account_contact_shares_own_only ON public.access_site_contact_share_revisions
      USING (account_id = NULLIF(current_setting('can.account_id', true), '')::uuid)
      WITH CHECK (account_id = NULLIF(current_setting('can.account_id', true), '')::uuid);
  END IF;
END;
$$;
