-- Explicit Site editor-created, revocable public-safe preview snapshots.
-- Not a Site publication, Program release, enrollment endpoint or mutable CMS.
CREATE TABLE IF NOT EXISTS public.site_website_preview_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  website_revision integer NOT NULL CHECK (website_revision > 0),
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  pages jsonb NOT NULL CHECK (jsonb_typeof(pages) = 'object'
    AND octet_length(pages::text) <= 4194304),
  created_by_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT site_website_preview_share_expiry_ck CHECK (expires_at > created_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS site_website_preview_share_site_idx
  ON public.site_website_preview_shares(site_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS site_website_preview_share_expiry_idx
  ON public.site_website_preview_shares(expires_at) WHERE revoked_at IS NULL;
--> statement-breakpoint
-- The application server alone may mint or read snapshots. Anonymous visitors
-- never receive DB credentials; the token reader is a deliberately bounded GET.
ALTER TABLE public.site_website_preview_shares ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.site_website_preview_shares FROM PUBLIC;
