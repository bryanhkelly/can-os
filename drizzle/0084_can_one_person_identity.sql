-- Canonical CAN Person ownership in the production Drizzle migration chain.
-- Duplicate of the reviewed idempotent patch in database/canonical/v3.0.1.
-- Apply before deploying code that reads access_accounts.person_id.
-- CAN OS: one immutable CAN Person per account, across all active grants.
-- Multiple roles, organizations, and Sites for this SAME Person remain valid.
-- This is a real account ownership constraint, not an identity bridge.
-- Isolated QA migration first; do not confuse this with the remaining
-- education_v30 Person/Account foreign-key cutover.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.account_person_grants a
    JOIN public.account_person_grants b
      ON a.account_id=b.account_id
     AND a.active AND b.active AND a.person_id<>b.person_id
  ) THEN
    RAISE EXCEPTION 'Existing account has more than one active Person'
      USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT person_id FROM public.account_person_grants
      WHERE active GROUP BY person_id
      HAVING count(DISTINCT account_id)>1
    ) person_with_two_accounts
  ) THEN
    RAISE EXCEPTION 'Existing active Person is linked to multiple accounts'
      USING ERRCODE='23514';
  END IF;
END $preflight$;

ALTER TABLE public.access_accounts
  ADD COLUMN IF NOT EXISTS person_id uuid
  REFERENCES public.people(id) ON DELETE RESTRICT;

-- An account with one established Person retains the same immutable identity
-- even if all their roles are later revoked. Unclaimed new accounts may remain
-- null only until an authorized first grant is issued.
UPDATE public.access_accounts account
SET person_id=source.person_id
FROM (
  SELECT account_id,min(person_id::text)::uuid AS person_id
  FROM public.account_person_grants
  WHERE active
  GROUP BY account_id
) source
WHERE account.id=source.account_id AND account.person_id IS NULL;

DO $check_anchor$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.access_accounts account
    JOIN public.account_person_grants grant_row
      ON grant_row.account_id=account.id AND grant_row.active
    WHERE account.person_id IS DISTINCT FROM grant_row.person_id
  ) THEN
    RAISE EXCEPTION 'CAN account Person anchor conflicts with an active grant'
      USING ERRCODE='23514';
  END IF;
END $check_anchor$;

CREATE UNIQUE INDEX IF NOT EXISTS access_accounts_person_id_uq
  ON public.access_accounts(person_id) WHERE person_id IS NOT NULL;

-- A direct account update must not swap a human identity after first bind.
-- Grant revocation affects authorization, never ownership or history.
CREATE OR REPLACE FUNCTION public.can_preserve_account_person()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp
AS $preserve_person$
BEGIN
  IF OLD.person_id IS NOT NULL AND NEW.person_id IS DISTINCT FROM OLD.person_id THEN
    RAISE EXCEPTION 'CAN account Person identity cannot be reassigned'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $preserve_person$;

DROP TRIGGER IF EXISTS can_account_person_immutable
  ON public.access_accounts;
CREATE TRIGGER can_account_person_immutable
  BEFORE UPDATE OF person_id ON public.access_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.can_preserve_account_person();

CREATE OR REPLACE FUNCTION public.can_enforce_one_person_per_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp
AS $one_person$
DECLARE anchored uuid;
BEGIN
  -- Historical role grants are evidence. Once issued, their owning account
  -- and Person cannot be rewritten even after revocation. Changes in
  -- authorization are expressed only by updating active/state.
  IF TG_OP='UPDATE' AND (
    NEW.account_id IS DISTINCT FROM OLD.account_id OR
    NEW.person_id IS DISTINCT FROM OLD.person_id
  ) THEN
    RAISE EXCEPTION 'Existing CAN role grant identity cannot be reassigned'
      USING ERRCODE='23514';
  END IF;
  IF NEW.active THEN
    -- Updating the account row, not merely selecting it FOR UPDATE, is
    -- important: under REPEATABLE READ competing attempts will serialize or
    -- abort rather than both accept different Persons from stale snapshots.
    UPDATE public.access_accounts account
    SET person_id=COALESCE(account.person_id,NEW.person_id)
    WHERE account.id=NEW.account_id
      AND (account.person_id IS NULL OR account.person_id=NEW.person_id)
    RETURNING account.person_id INTO anchored;
    IF anchored IS DISTINCT FROM NEW.person_id THEN
      RAISE EXCEPTION 'CAN account already belongs to another Person'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $one_person$;

DROP TRIGGER IF EXISTS can_account_grants_one_person_guard
  ON public.account_person_grants;
CREATE TRIGGER can_account_grants_one_person_guard
  BEFORE INSERT OR UPDATE OF account_id,person_id,active
  ON public.account_person_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.can_enforce_one_person_per_account();

COMMENT ON COLUMN public.access_accounts.person_id IS
  'Authoritative immutable CAN Person identity across all roles and Sites.';
COMMENT ON FUNCTION public.can_enforce_one_person_per_account() IS
  'Serializes active grant issuance through the owning account Person anchor.';

