-- CAN OS App Admin grant integrity (additive production migration).
-- A platform administrator has NO Site or Organization scope.
-- Prevent duplicate concurrently active App Admin grants for one account.
-- Safe to apply after confirming no existing malformed / duplicate app_admin grants.
-- Does not create, activate, or elevate any administrator.
BEGIN;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.account_person_grants
    WHERE role = 'app_admin'
      AND (organization_id IS NOT NULL OR site_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'app_admin grants must have no organization or site';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.account_person_grants
    WHERE role = 'app_admin' AND active = true
    GROUP BY account_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate active app_admin membership requires independent reconciliation';
  END IF;
END $guard$;

ALTER TABLE public.account_person_grants
  ADD CONSTRAINT account_person_grants_app_admin_global_scope_ck
  CHECK (
    role <> 'app_admin'
    OR (organization_id IS NULL AND site_id IS NULL)
  );

CREATE UNIQUE INDEX account_person_grants_one_active_app_admin_per_account_uq
  ON public.account_person_grants(account_id)
  WHERE role = 'app_admin' AND active = true;

COMMIT;
