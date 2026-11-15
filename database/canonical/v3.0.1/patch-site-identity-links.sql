-- Explicit public-schema -> canonical v3.0.1 Site identity correspondence.
-- No automatic matches, name matches, imports, or grants.
-- A Site is linked only after independent human evidence review.
-- Safe to apply on test01 before a deliberate production rollout.
CREATE TABLE IF NOT EXISTS public.site_canonical_identity_links (
  public_site_id uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE RESTRICT,
  canonical_site_id uuid NOT NULL UNIQUE REFERENCES education_v30.sites(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','revoked')),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) >= 12),
  requested_by_person_id uuid NOT NULL,
  reviewed_by_person_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_canonical_links_review_ck CHECK (
    (status='pending' AND reviewed_by_person_id IS NULL AND reviewed_at IS NULL) OR
    (status<>'pending' AND reviewed_by_person_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND reviewed_by_person_id <> requested_by_person_id)
  )
);
COMMENT ON TABLE public.site_canonical_identity_links IS
 'Explicit independently reviewed Site identity relation. This is not membership, publishing, deployment or enrollment authority.';
ALTER TABLE public.site_canonical_identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_canonical_identity_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_canonical_identity_links FROM PUBLIC;
-- The website application may READ only approved, current mappings.
-- It cannot create/approve/revoke mapping records through this grant.
DO $links$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='can_v30_public_site_app') THEN
    EXECUTE 'GRANT SELECT ON public.site_canonical_identity_links TO can_v30_public_site_app';
    EXECUTE 'CREATE POLICY site_identity_links_public_site_app_read ON public.site_canonical_identity_links FOR SELECT TO can_v30_public_site_app USING (status = ''approved'')';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='can_v30_public_site_reader') THEN
    EXECUTE 'GRANT SELECT ON public.site_canonical_identity_links TO can_v30_public_site_reader';
    EXECUTE 'CREATE POLICY site_identity_links_reader_read ON public.site_canonical_identity_links FOR SELECT TO can_v30_public_site_reader USING (status = ''approved'')';
  END IF;
END $links$;
-- No INSERT/UPDATE/DELETE role grant. Reviewers use the existing
-- privileged, audited database-change process; operational UI must not
-- turn a submitted code or guessed Site name into an approved mapping.
