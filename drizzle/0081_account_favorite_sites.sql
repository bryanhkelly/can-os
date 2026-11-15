-- Account-owned, portable bookmarks. No Site, Organization or educational authority is granted.
CREATE TABLE IF NOT EXISTS public.access_account_favorite_sites (
  account_id uuid NOT NULL REFERENCES public.access_accounts(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_account_favorite_sites_pkey PRIMARY KEY (account_id, site_id)
);
CREATE INDEX IF NOT EXISTS access_account_favorite_sites_site_idx
  ON public.access_account_favorite_sites (site_id);
-- Defence in depth: account ID is set only inside a verified server transaction.
ALTER TABLE public.access_account_favorite_sites ENABLE ROW LEVEL SECURITY;
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'access_account_favorite_sites'
       AND policyname = 'account_favorites_own_only'
  ) THEN
    CREATE POLICY account_favorites_own_only ON public.access_account_favorite_sites
      USING (account_id = NULLIF(current_setting('can.account_id', true), '')::uuid)
      WITH CHECK (account_id = NULLIF(current_setting('can.account_id', true), '')::uuid);
  END IF;
END;
$;
