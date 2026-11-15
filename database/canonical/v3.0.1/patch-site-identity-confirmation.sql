-- Canonical Site identity link approval requires native provider confirmation.
-- Apply after patch-site-identity-links.sql. No automatic approvals.
BEGIN;
ALTER TABLE public.site_canonical_identity_links
  ADD COLUMN IF NOT EXISTS confirmed_by_canonical_person_id uuid;
ALTER TABLE public.site_canonical_identity_links
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
DO $site_identity_confirmation$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid =
    'public.site_canonical_identity_links'::regclass
    AND conname='site_canonical_links_confirmation_ck') THEN
    ALTER TABLE public.site_canonical_identity_links
      ADD CONSTRAINT site_canonical_links_confirmation_ck
      CHECK ((confirmed_by_canonical_person_id IS NULL) = (confirmed_at IS NULL)
         AND (status <> 'approved' OR confirmed_at IS NOT NULL)) NOT VALID;
  END IF;
END $site_identity_confirmation$;
ALTER TABLE public.site_canonical_identity_links
  VALIDATE CONSTRAINT site_canonical_links_confirmation_ck;
COMMIT;
-- Review authority is not implied by either public or native Site access.
-- Approval additionally requires a separate authorized CAN institutional
-- reviewer, evidence reference, and an audit event.
