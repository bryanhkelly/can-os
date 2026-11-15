-- CAN OS verified school-staff SSO. Additive only; no identity or Site fixtures.
-- Apply on an operator-approved environment after reviewing the existing schema.
-- Existing canonical auth/session and Site identity migrations are prerequisites.
BEGIN;

CREATE TABLE IF NOT EXISTS public.access_account_canonical_principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL
    REFERENCES public.access_accounts(id) ON DELETE RESTRICT,
  canonical_principal_id uuid NOT NULL
    REFERENCES education_v30.persons(id) ON DELETE RESTRICT,
  verified_at timestamptz NOT NULL,
  verified_by_account_id uuid NOT NULL
    REFERENCES public.access_accounts(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_account_canonical_principals_not_self_verified
    CHECK (account_id <> verified_by_account_id),
  CONSTRAINT access_account_canonical_principals_revocation_after_verification
    CHECK (revoked_at IS NULL OR revoked_at >= verified_at)
);

-- Exactly one currently accepted CAN account per native Person, and one
-- canonical Person per CAN account. Reassignment requires audited revocation.
CREATE UNIQUE INDEX IF NOT EXISTS access_account_canonical_principals_active_account_uq
  ON public.access_account_canonical_principals(account_id)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS access_account_canonical_principals_active_person_uq
  ON public.access_account_canonical_principals(canonical_principal_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS access_account_canonical_principals_principal_idx
  ON public.access_account_canonical_principals(canonical_principal_id);

ALTER TABLE public.access_account_canonical_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_account_canonical_principals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.access_account_canonical_principals FROM PUBLIC;

-- Only the designated application owner may inspect/mutate these restricted
-- mappings; all end-user authority is separately verified server-side.
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='access_account_canonical_principals'
      AND policyname='canonical_staff_link_trusted_owner'
  ) THEN
    EXECUTE format(
      'CREATE POLICY canonical_staff_link_trusted_owner
         ON public.access_account_canonical_principals
         FOR ALL TO %I USING (true) WITH CHECK (true)', current_user
    );
  END IF;
END $policy$;

COMMENT ON TABLE public.access_account_canonical_principals IS
  'Independent institutional identity verification of CAN account to canonical Person, not an automatic role grant; require current Site relationship and staff grants on each request.';
COMMENT ON COLUMN public.access_account_canonical_principals.canonical_principal_id IS
  'Canonical education_v30.persons.id. Never infer identity by normalized email or legacy Person UUID.';

COMMIT;
